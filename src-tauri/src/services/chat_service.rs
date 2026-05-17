use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;
use sqlx::SqlitePool;
use std::path::PathBuf;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

use crate::{
    agents::runner::{anthropic_tool_definitions, openai_tool_definitions},
    error::{AppError, AppResult},
    models::{ChatToolCall, Message},
    services::sse_parser::{SseEvent, SseParser},
    tools::executor::ToolExecutor,
};

use super::{chat_tool_call_service, now_rfc3339, provider_service, tool_call_service};
use tool_call_service::{PendingToolCall, ToolCallDelta};

const MAX_TOOL_CALL_ITERATIONS: usize = 30;

pub async fn get_messages(db: &SqlitePool, session_id: &str) -> AppResult<Vec<Message>> {
    let messages = sqlx::query_as::<_, Message>(
        "SELECT id, session_id, role, content, created_at FROM messages \
         WHERE session_id = ?1 ORDER BY created_at ASC",
    )
    .bind(session_id)
    .fetch_all(db)
    .await?;

    Ok(messages)
}

#[allow(clippy::too_many_arguments)]
pub async fn send_message(
    db: &SqlitePool,
    session_id: &str,
    content: &str,
    provider_id: Option<&str>,
    model_id: Option<&str>,
    on_token: Channel<String>,
    app_handle: &AppHandle,
    cancel_token: CancellationToken,
) -> AppResult<()> {
    let result = send_message_inner(
        db,
        session_id,
        content,
        provider_id,
        model_id,
        on_token,
        app_handle,
        cancel_token,
    )
    .await;
    match &result {
        Err(AppError::Cancelled) => {
            let _ = app_handle.emit("chat-done", "cancelled");
            return Ok(());
        }
        Err(ref error) => {
            let _ = app_handle.emit("chat-error", error.to_string());
        }
        _ => {}
    }
    result
}

#[allow(clippy::too_many_arguments)]
async fn send_message_inner(
    db: &SqlitePool,
    session_id: &str,
    content: &str,
    provider_id: Option<&str>,
    model_id: Option<&str>,
    on_token: Channel<String>,
    app_handle: &AppHandle,
    cancel_token: CancellationToken,
) -> AppResult<()> {
    let normalized = content.trim();
    if normalized.is_empty() {
        return Err(AppError::Validation(
            "Message content cannot be empty".to_string(),
        ));
    }

    let user_message = Message {
        id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        role: "user".to_string(),
        content: normalized.to_string(),
        created_at: now_rfc3339(),
    };

    sqlx::query(
        "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(&user_message.id)
    .bind(&user_message.session_id)
    .bind(&user_message.role)
    .bind(&user_message.content)
    .bind(&user_message.created_at)
    .execute(db)
    .await?;

    let provider = provider_service::get_provider_for_chat(db, provider_id).await?;

    // Pre-flight: check API key is configured (except for local providers like Ollama)
    if provider.provider_type != "ollama"
        && provider
            .api_key
            .as_deref()
            .is_none_or(|k| k.trim().is_empty())
    {
        return Err(AppError::Validation(format!(
            "API key not configured for '{}'. Go to Settings \u{2192} Providers and enter your API key.",
            provider.name
        )));
    }

    let history = get_messages(db, session_id).await?;

    // Use caller-supplied model_id if provided, otherwise fall back to provider default
    let model = model_id.unwrap_or(&provider.model);

    // Determine if we should enable tool use for this request.
    // Local providers (ollama) don't reliably support tool calling.
    let tools_enabled = provider.provider_type != "ollama";

    // Build a ToolExecutor using the project path from session context.
    // For chat mode we use a default sandbox (current working dir).
    let executor = ToolExecutor::new(PathBuf::from("."));

    // Build the initial messages array for the LLM
    let is_anthropic = provider.provider_type == "anthropic";
    let mut llm_messages = build_llm_messages(&history, is_anthropic);

    let mut iteration = 0;
    let mut final_text;

    loop {
        if cancel_token.is_cancelled() {
            return Err(AppError::Cancelled);
        }

        // Stream LLM response and accumulate text + tool calls
        let (text, tool_calls) = if is_anthropic {
            stream_anthropic_with_tools(
                model,
                provider.api_key.as_deref(),
                &llm_messages,
                tools_enabled,
                &on_token,
                &cancel_token,
            )
            .await?
        } else {
            stream_openai_with_tools(
                &provider.base_url,
                model,
                provider.api_key.as_deref(),
                &llm_messages,
                tools_enabled,
                &on_token,
                &cancel_token,
            )
            .await?
        };

        final_text = text.clone();

        // If no tool calls or max iterations reached, we're done
        if tool_calls.is_empty() || iteration >= MAX_TOOL_CALL_ITERATIONS {
            break;
        }

        // Execute tools
        let results = tool_call_service::execute_tool_calls(
            &tool_calls,
            &executor,
            &cancel_token,
            app_handle,
            session_id,
        )
        .await;

        // Save tool calls to DB and build assistant message ID
        let assistant_msg_id = Uuid::new_v4().to_string();
        for (tc, result) in tool_calls.iter().zip(results.iter()) {
            let tool_call_record = ChatToolCall {
                id: tc.id.clone(),
                session_id: session_id.to_string(),
                message_id: assistant_msg_id.clone(),
                tool_name: tc.name.clone(),
                tool_input: tc.arguments.clone(),
                tool_output: Some(result.output.clone()),
                is_error: result.is_error,
                status: if result.is_error {
                    "error".to_string()
                } else {
                    "completed".to_string()
                },
                duration_ms: None,
                created_at: now_rfc3339(),
                completed_at: Some(now_rfc3339()),
            };
            let _ = chat_tool_call_service::insert(db, &tool_call_record).await;
        }

        // Append assistant message (with tool_calls) + tool results to LLM messages
        if is_anthropic {
            // Assistant message with tool_use content blocks
            let mut content_blocks: Vec<Value> = Vec::new();
            if !text.is_empty() {
                content_blocks.push(serde_json::json!({"type": "text", "text": text}));
            }
            for tc in &tool_calls {
                let input: Value =
                    serde_json::from_str(&tc.arguments).unwrap_or(Value::Object(Default::default()));
                content_blocks.push(serde_json::json!({
                    "type": "tool_use",
                    "id": tc.id,
                    "name": tc.name,
                    "input": input,
                }));
            }
            llm_messages.push(serde_json::json!({"role": "assistant", "content": content_blocks}));

            // Tool results as user message with tool_result content blocks
            let tool_result_blocks: Vec<Value> = tool_calls
                .iter()
                .zip(results.iter())
                .map(|(tc, result)| {
                    serde_json::json!({
                        "type": "tool_result",
                        "tool_use_id": tc.id,
                        "content": result.output,
                    })
                })
                .collect();
            llm_messages.push(serde_json::json!({"role": "user", "content": tool_result_blocks}));
        } else {
            // OpenAI format: assistant message with tool_calls array
            let tc_array: Vec<Value> = tool_calls
                .iter()
                .map(|tc| {
                    serde_json::json!({
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": tc.arguments,
                        }
                    })
                })
                .collect();

            let assistant_content = if text.is_empty() {
                Value::Null
            } else {
                Value::String(text.clone())
            };
            llm_messages.push(serde_json::json!({
                "role": "assistant",
                "content": assistant_content,
                "tool_calls": tc_array,
            }));

            // Tool result messages (one per tool)
            for (tc, result) in tool_calls.iter().zip(results.iter()) {
                llm_messages.push(serde_json::json!({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result.output,
                }));
            }
        }

        iteration += 1;
    }

    // Save the final assistant message to DB
    let assistant_message = Message {
        id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        role: "assistant".to_string(),
        content: final_text,
        created_at: now_rfc3339(),
    };

    sqlx::query(
        "INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(&assistant_message.id)
    .bind(&assistant_message.session_id)
    .bind(&assistant_message.role)
    .bind(&assistant_message.content)
    .bind(&assistant_message.created_at)
    .execute(db)
    .await?;

    let _ = app_handle.emit("chat-done", assistant_message.id.clone());
    Ok(())
}

/// Build the initial LLM messages array from DB history.
fn build_llm_messages(history: &[Message], is_anthropic: bool) -> Vec<Value> {
    if is_anthropic {
        // Anthropic: filter out system messages (handled separately in request)
        history
            .iter()
            .filter(|m| m.role == "user" || m.role == "assistant")
            .map(|m| serde_json::json!({"role": m.role, "content": m.content}))
            .collect()
    } else {
        history
            .iter()
            .map(|m| serde_json::json!({"role": m.role, "content": m.content}))
            .collect()
    }
}

// ─── OpenAI-compatible streaming with tool call support ──────────────────────

const SYSTEM_INSTRUCTIONS: &str = concat!(
    "IMPORTANT: Reply using the same language as the user's latest message. If user writes Indonesian, answer in Indonesian. Never switch to another language unless the user explicitly asks you to.\n\n",
    "INTERACTIVE PREVIEW: When the user asks for a visualization, diagram, chart, interactive demo, or any visual HTML content, output it as a fenced code block with tag `html:preview`. The app renders it as a live iframe preview with a full design system pre-loaded (CSS variables, SVG color ramp classes, pre-styled form elements, light/dark mode).\n\n",
    "Design rules: flat (no gradients/shadows/glow), use CSS vars for colors (var(--color-text-primary), var(--color-background-secondary), etc). system-ui font, 2 weights (400/500), sentence case. Structure: style \u{2192} content \u{2192} script last.\n\n",
    "SVG diagrams: use pre-loaded classes \u{2014} `.t` (14px text), `.ts` (12px), `.th` (14px bold), `.box` (neutral), `.node` (clickable), `.arr` (arrow), `.leader` (dashed). Color ramps: `class=\"c-blue\"` on `<g>` wrapping shape+text \u{2014} auto light/dark. Available: c-purple, c-teal, c-coral, c-blue, c-amber, c-green, c-red, c-gray, c-pink. Max 2-3 ramps per diagram.\n\n",
    "Chart.js: wrap canvas in div with position:relative + explicit height. Load UMD from cdnjs.cloudflare.com with onload callback. Disable default legend, build custom HTML legend with 10px colored squares.\n\n",
    "Interactive: form elements pre-styled. Use sendPrompt(text) for drill-down. CDN: cdnjs.cloudflare.com, cdn.jsdelivr.net, unpkg.com, esm.sh only.\n\n",
    "Always output COMPLETE standalone HTML (DOCTYPE, html, head, body). No titles/prose inside widget \u{2014} explanations go in your response text.\n\n",
    "You have access to tools for reading/writing files, running commands, and searching. Use them when the user asks you to interact with their project files or system."
);

#[allow(clippy::too_many_arguments)]
async fn stream_openai_with_tools(
    base_url: &str,
    model: &str,
    api_key: Option<&str>,
    messages: &[Value],
    tools_enabled: bool,
    on_token: &Channel<String>,
    cancel_token: &CancellationToken,
) -> AppResult<(String, Vec<tool_call_service::ParsedToolCall>)> {
    let client = reqwest::Client::new();
    let endpoint = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    // Prepend system message
    let mut all_messages = vec![serde_json::json!({
        "role": "system",
        "content": SYSTEM_INSTRUCTIONS,
    })];
    all_messages.extend_from_slice(messages);

    let mut payload = serde_json::json!({
        "model": model,
        "messages": all_messages,
        "temperature": 0.2,
        "stream": true,
    });

    if tools_enabled {
        let tools = openai_tool_definitions();
        if !tools.is_empty() {
            payload["tools"] = Value::Array(tools);
        }
    }

    let mut request = client
        .post(&endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&payload);

    if let Some(key) = api_key.filter(|k| !k.trim().is_empty()) {
        request = request.header(AUTHORIZATION, format!("Bearer {key}"));
    }

    let response = request.send().await?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Http(format!("{status}: {body}")));
    }

    // Stream and accumulate text + tool calls
    let mut parser = SseParser::new(response);
    let mut output = String::new();
    let mut pending_tool_calls: Vec<PendingToolCall> = Vec::new();

    while let Some(event) = parser.next_event(cancel_token).await {
        match event? {
            SseEvent::Data(payload) => {
                let value: Value = match serde_json::from_str(&payload) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                // Accumulate text content
                if let Some(token) = value
                    .get("choices")
                    .and_then(Value::as_array)
                    .and_then(|c| c.first())
                    .and_then(|c| c.get("delta"))
                    .and_then(|d| d.get("content"))
                    .and_then(Value::as_str)
                {
                    output.push_str(token);
                    let _ = on_token.send(token.to_string());
                }

                // Accumulate tool call deltas
                if let Some(tc_array) = value
                    .get("choices")
                    .and_then(Value::as_array)
                    .and_then(|c| c.first())
                    .and_then(|c| c.get("delta"))
                    .and_then(|d| d.get("tool_calls"))
                    .and_then(Value::as_array)
                {
                    for tc_delta in tc_array {
                        let index = tc_delta.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                        let id = tc_delta.get("id").and_then(Value::as_str).map(String::from);
                        let name = tc_delta
                            .get("function")
                            .and_then(|f| f.get("name"))
                            .and_then(Value::as_str)
                            .map(String::from);
                        let arguments = tc_delta
                            .get("function")
                            .and_then(|f| f.get("arguments"))
                            .and_then(Value::as_str)
                            .map(String::from);

                        tool_call_service::accumulate_delta(
                            &mut pending_tool_calls,
                            ToolCallDelta {
                                index,
                                id,
                                name,
                                arguments,
                            },
                        );
                    }
                }
            }
            SseEvent::Done => break,
            SseEvent::Event { .. } => {}
        }
    }

    let tool_calls = tool_call_service::finalize_tool_calls(pending_tool_calls);
    Ok((output, tool_calls))
}

// ─── Anthropic streaming with tool call support ──────────────────────────────

#[allow(clippy::too_many_arguments)]
async fn stream_anthropic_with_tools(
    model: &str,
    api_key: Option<&str>,
    messages: &[Value],
    tools_enabled: bool,
    on_token: &Channel<String>,
    cancel_token: &CancellationToken,
) -> AppResult<(String, Vec<tool_call_service::ParsedToolCall>)> {
    let client = reqwest::Client::new();

    let mut payload = serde_json::json!({
        "model": model,
        "max_tokens": 8096,
        "messages": messages,
        "temperature": 0.2,
        "stream": true,
        "system": SYSTEM_INSTRUCTIONS,
    });

    if tools_enabled {
        let tools = anthropic_tool_definitions();
        if !tools.is_empty() {
            payload["tools"] = Value::Array(tools);
        }
    }

    let mut request = client
        .post("https://api.anthropic.com/v1/messages")
        .header(CONTENT_TYPE, "application/json")
        .header("anthropic-version", "2023-06-01")
        .json(&payload);

    if let Some(key) = api_key.filter(|k| !k.trim().is_empty()) {
        request = request.header("x-api-key", key);
    }

    let response = request.send().await?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Http(format!("Anthropic {status}: {body}")));
    }

    // Stream and accumulate text + tool calls
    let mut parser = SseParser::new(response);
    let mut output = String::new();
    let mut tool_calls: Vec<tool_call_service::ParsedToolCall> = Vec::new();
    // Track current tool_use block being accumulated
    let mut current_tool_id = String::new();
    let mut current_tool_name = String::new();
    let mut current_tool_input = String::new();

    while let Some(event) = parser.next_event(cancel_token).await {
        match event? {
            SseEvent::Event { event_type, data } => {
                let value: Value = match serde_json::from_str(&data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                match event_type.as_str() {
                    "content_block_start" => {
                        // Check if this is a tool_use block
                        if let Some(content_block) = value.get("content_block") {
                            let block_type = content_block.get("type").and_then(Value::as_str).unwrap_or("");
                            if block_type == "tool_use" {
                                current_tool_id = content_block
                                    .get("id")
                                    .and_then(Value::as_str)
                                    .unwrap_or("")
                                    .to_string();
                                current_tool_name = content_block
                                    .get("name")
                                    .and_then(Value::as_str)
                                    .unwrap_or("")
                                    .to_string();
                                current_tool_input.clear();
                            }
                        }
                    }
                    "content_block_delta" => {
                        if let Some(delta) = value.get("delta") {
                            let delta_type = delta.get("type").and_then(Value::as_str).unwrap_or("");
                            match delta_type {
                                "text_delta" => {
                                    if let Some(text) = delta.get("text").and_then(Value::as_str) {
                                        output.push_str(text);
                                        let _ = on_token.send(text.to_string());
                                    }
                                }
                                "input_json_delta" => {
                                    if let Some(partial) = delta.get("partial_json").and_then(Value::as_str) {
                                        current_tool_input.push_str(partial);
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    "content_block_stop" => {
                        // Finalize current tool_use block if we have one
                        if !current_tool_name.is_empty() {
                            tool_calls.push(tool_call_service::ParsedToolCall {
                                id: current_tool_id.clone(),
                                name: current_tool_name.clone(),
                                arguments: current_tool_input.clone(),
                            });
                            current_tool_id.clear();
                            current_tool_name.clear();
                            current_tool_input.clear();
                        }
                    }
                    _ => {}
                }
            }
            SseEvent::Data(payload) => {
                // Fallback: some Anthropic events come as plain data
                let value: Value = match serde_json::from_str(&payload) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let event_type = value.get("type").and_then(Value::as_str).unwrap_or("");
                if event_type == "content_block_delta" {
                    if let Some(delta) = value.get("delta") {
                        let delta_type = delta.get("type").and_then(Value::as_str).unwrap_or("");
                        if delta_type == "text_delta" {
                            if let Some(text) = delta.get("text").and_then(Value::as_str) {
                                output.push_str(text);
                                let _ = on_token.send(text.to_string());
                            }
                        } else if delta_type == "input_json_delta" {
                            if let Some(partial) = delta.get("partial_json").and_then(Value::as_str) {
                                current_tool_input.push_str(partial);
                            }
                        }
                    }
                }
            }
            SseEvent::Done => break,
        }
    }

    Ok((output, tool_calls))
}

/// Generate a short title for a conversation using the same provider/model.
pub async fn generate_title(
    db: &SqlitePool,
    session_id: &str,
    provider_id: Option<&str>,
    model_id: Option<&str>,
) -> AppResult<String> {
    let provider = provider_service::get_provider_for_chat(db, provider_id).await?;
    let model = model_id.unwrap_or(&provider.model);
    let history = get_messages(db, session_id).await?;

    if history.is_empty() {
        return Ok("New Chat".to_string());
    }

    // Build a compact summary of the conversation (max first 2 exchanges)
    let snippet: Vec<Value> = history
        .iter()
        .filter(|m| m.role != "system")
        .take(4)
        .map(|m| {
            let content = if m.content.len() > 200 {
                format!("{}…", &m.content[..200])
            } else {
                m.content.clone()
            };
            serde_json::json!({ "role": m.role, "content": content })
        })
        .collect();

    let mut messages = vec![serde_json::json!({
        "role": "system",
        "content": "Generate a short title (2-5 words) for this conversation. Reply with ONLY the title, nothing else. No quotes, no punctuation at the end. Examples: 'React Auth Setup', 'Greeting', 'Python Bug Fix', 'Database Migration Help'."
    })];
    messages.extend(snippet);
    messages.push(serde_json::json!({
        "role": "user",
        "content": "Generate a short title for the conversation above."
    }));

    let title = if provider.provider_type == "anthropic" {
        generate_title_anthropic(&provider, model, &messages).await?
    } else {
        generate_title_openai(&provider, model, &messages).await?
    };

    // Clean up: remove quotes, trim, cap length
    let cleaned = title
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim_end_matches('.')
        .trim();

    let final_title = if cleaned.is_empty() {
        "New Chat".to_string()
    } else if cleaned.len() > 50 {
        let cut = &cleaned[..50];
        let last_space = cut.rfind(' ').unwrap_or(50);
        format!("{}…", &cleaned[..last_space])
    } else {
        cleaned.to_string()
    };

    Ok(final_title)
}

async fn generate_title_openai(
    provider: &crate::models::Provider,
    model: &str,
    messages: &[Value],
) -> AppResult<String> {
    let client = reqwest::Client::new();
    let endpoint = format!(
        "{}/chat/completions",
        provider.base_url.trim_end_matches('/')
    );

    let payload = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 20,
        "stream": false,
    });

    let mut request = client
        .post(&endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&payload);

    if let Some(key) = provider.api_key.as_deref().filter(|k| !k.trim().is_empty()) {
        request = request.header(AUTHORIZATION, format!("Bearer {key}"));
    }

    let response = request.send().await?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Http(format!("{status}: {body}")));
    }

    let body: Value = response.json().await?;
    let title = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("New Chat")
        .to_string();

    Ok(title)
}

async fn generate_title_anthropic(
    provider: &crate::models::Provider,
    model: &str,
    messages: &[Value],
) -> AppResult<String> {
    // Extract system message and user/assistant messages
    let system = messages
        .first()
        .and_then(|m| m["content"].as_str())
        .unwrap_or("");

    let non_system: Vec<Value> = messages
        .iter()
        .filter(|m| m["role"].as_str() != Some("system"))
        .cloned()
        .collect();

    let payload = serde_json::json!({
        "model": model,
        "max_tokens": 20,
        "system": system,
        "messages": non_system,
        "temperature": 0.3,
    });

    let client = reqwest::Client::new();
    let mut request = client
        .post("https://api.anthropic.com/v1/messages")
        .header(CONTENT_TYPE, "application/json")
        .header("anthropic-version", "2023-06-01")
        .json(&payload);

    if let Some(key) = provider.api_key.as_deref().filter(|k| !k.trim().is_empty()) {
        request = request.header("x-api-key", key);
    }

    let response = request.send().await?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Http(format!("{status}: {body}")));
    }

    let body: Value = response.json().await?;
    let title = body["content"][0]["text"]
        .as_str()
        .unwrap_or("New Chat")
        .to_string();

    Ok(title)
}

const EXCALIDRAW_SYSTEM_PROMPT: &str = r##"You generate Excalidraw diagram elements as JSON. Output ONLY a valid JSON array of Excalidraw elements. No markdown, no explanation, no code fences.

Each element needs these fields:
- id: unique string (use short ids like "a1", "b2", etc)
- type: "rectangle" | "ellipse" | "diamond" | "text" | "arrow" | "line"
- x, y: position (number, start from 100,100, space elements 200px apart)
- width, height: size (rectangles: 200x80, text: auto based on content)
- strokeColor: "#1e1e1e"
- backgroundColor: "transparent" or color like "#a5d8ff", "#b2f2bb", "#ffd8a8", "#ffc9c9", "#d0bfff"
- fillStyle: "solid" for colored fills, "hachure" for sketch style
- strokeWidth: 2
- roughness: 1 (sketchy) or 0 (clean)
- opacity: 100
- angle: 0
- seed: random integer (1000-9999)
- version: 1
- versionNonce: random integer
- isDeleted: false
- groupIds: []
- boundElements: null or [{"id": "textId", "type": "text"}] for shapes with text inside
- updated: 1700000000000
- link: null
- locked: false
- frameId: null
- index: null

For TEXT elements, also include:
- fontSize: 20 (or 16 for smaller)
- fontFamily: 1
- text: "the text content"
- textAlign: "center"
- verticalAlign: "middle"
- containerId: "parentShapeId" (if inside a shape) or null
- originalText: same as text
- autoResize: true
- lineHeight: 1.25

For ARROW/LINE elements, also include:
- points: [[0,0],[200,0]] (relative points from x,y)
- startBinding: {"elementId": "sourceId", "focus": 0, "gap": 5, "fixedPoint": null} or null
- endBinding: {"elementId": "targetId", "focus": 0, "gap": 5, "fixedPoint": null} or null
- startArrowhead: null
- endArrowhead: "arrow" (for arrows) or null (for lines)
- lastCommittedPoint: null
- elbowed: false

RULES:
- Text inside shapes: create shape with boundElements:[{"id":"tId","type":"text"}] AND text with containerId:"shapeId"
- Space elements 200px+ apart
- Use arrows with startBinding/endBinding to connect shapes
- Output ONLY the JSON array"##;

/// Generate Excalidraw elements from a text prompt using the LLM.
pub async fn generate_excalidraw(
    db: &SqlitePool,
    prompt: &str,
    existing_elements: Option<&str>,
    provider_id: Option<&str>,
    model_id: Option<&str>,
) -> AppResult<String> {
    let provider = provider_service::get_provider_for_chat(db, provider_id).await?;
    let model = model_id.unwrap_or(&provider.model);

    let mut messages = vec![
        serde_json::json!({"role": "system", "content": EXCALIDRAW_SYSTEM_PROMPT}),
    ];

    // If there are existing elements, include them so AI can edit
    if let Some(elements) = existing_elements {
        messages.push(serde_json::json!({
            "role": "user",
            "content": format!("Here are the current canvas elements:\n{}\n\nIMPORTANT: When I ask you to modify something, return ALL elements (modified + unmodified). Keep all existing element IDs, positions, and properties unless I specifically ask to change them.", elements)
        }));
        messages.push(serde_json::json!({
            "role": "assistant",
            "content": "I understand. I'll return the complete set of elements, only modifying what you ask for while preserving everything else exactly as-is."
        }));
    }

    messages.push(serde_json::json!({"role": "user", "content": prompt}));

    let client = reqwest::Client::new();
    let endpoint = format!("{}/chat/completions", provider.base_url.trim_end_matches('/'));

    let payload = serde_json::json!({
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 4000,
        "stream": false,
    });

    let mut request = client
        .post(&endpoint)
        .header(CONTENT_TYPE, "application/json")
        .json(&payload);

    if let Some(key) = provider.api_key.as_deref().filter(|k| !k.trim().is_empty()) {
        request = request.header(AUTHORIZATION, format!("Bearer {key}"));
    }

    let response = request.send().await?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Http(format!("{status}: {body}")));
    }

    let body: Value = response.json().await?;
    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("[]")
        .to_string();

    // Strip markdown code fences if AI added them
    let cleaned = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string();

    Ok(cleaned)
}

// ─── Integration Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod integration_tests {
    use super::*;
    use crate::services::tool_call_service::{
        accumulate_delta, execute_tool_calls_core, finalize_tool_calls, PendingToolCall,
        ParsedToolCall, ToolCallDelta,
    };
    use crate::tools::executor::ToolExecutor;
    use tempfile::tempdir;
    use tokio_util::sync::CancellationToken;

    /// Helper: create an SseParser from raw string chunks.
    fn parser_from_chunks(chunks: Vec<&str>) -> SseParser {
        SseParser::new_from_chunks(chunks)
    }

    // ─── Test: Full flow (SSE parse → accumulate → execute → result) ─────────

    /// End-to-end: parse SSE tool_calls deltas, accumulate, finalize, execute, verify output.
    #[tokio::test]
    async fn test_full_tool_call_flow() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("hello.txt"), "Hello, World!").unwrap();

        let executor = ToolExecutor::new(dir.path().to_path_buf());
        let cancel_token = CancellationToken::new();

        // Simulate streaming deltas for a read_file tool call
        let mut pending: Vec<PendingToolCall> = Vec::new();

        accumulate_delta(
            &mut pending,
            ToolCallDelta {
                index: 0,
                id: Some("call_123".to_string()),
                name: Some("read_file".to_string()),
                arguments: Some("{\"path\":\"".to_string()),
            },
        );
        accumulate_delta(
            &mut pending,
            ToolCallDelta {
                index: 0,
                id: None,
                name: None,
                arguments: Some("hello.txt\"}".to_string()),
            },
        );

        // Finalize
        let parsed = finalize_tool_calls(pending);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].name, "read_file");
        assert_eq!(parsed[0].id, "call_123");
        assert_eq!(parsed[0].arguments, "{\"path\":\"hello.txt\"}");

        // Execute
        let results = execute_tool_calls_core(&parsed, &executor, &cancel_token).await;
        assert_eq!(results.len(), 1);
        assert!(!results[0].is_error);
        assert!(results[0].output.contains("Hello, World!"));
    }

    // ─── Test: Max iterations limit ──────────────────────────────────────────

    /// Simulates a tool loop that always returns tool_calls — verifies it stops at MAX_TOOL_CALL_ITERATIONS.
    #[tokio::test]
    async fn test_max_iterations_limit() {
        // The loop logic in send_message_inner breaks when iteration >= MAX_TOOL_CALL_ITERATIONS.
        // We simulate this logic directly to verify the constant and behavior.
        let max = MAX_TOOL_CALL_ITERATIONS;
        assert_eq!(max, 30);

        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("data.txt"), "content").unwrap();
        let executor = ToolExecutor::new(dir.path().to_path_buf());
        let cancel_token = CancellationToken::new();

        // Simulate the tool loop: each iteration produces a tool call, loop should stop at 30
        let mut iteration = 0;
        loop {
            if iteration >= MAX_TOOL_CALL_ITERATIONS {
                break;
            }

            // Simulate: LLM always returns a read_file tool call
            let tool_calls = vec![ParsedToolCall {
                id: format!("call_{}", iteration),
                name: "read_file".to_string(),
                arguments: "{\"path\":\"data.txt\"}".to_string(),
            }];

            let results = execute_tool_calls_core(&tool_calls, &executor, &cancel_token).await;
            assert!(!results[0].is_error);

            iteration += 1;
        }

        // Verify we hit exactly 30 iterations
        assert_eq!(iteration, 30);
    }

    // ─── Test: Cancellation mid-tool-loop ────────────────────────────────────

    /// Cancellation token stops tool execution immediately.
    #[tokio::test]
    async fn test_cancellation_stops_execution() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("test.txt"), "data").unwrap();
        let executor = ToolExecutor::new(dir.path().to_path_buf());
        let cancel_token = CancellationToken::new();

        // Cancel before execution
        cancel_token.cancel();

        let parsed = vec![ParsedToolCall {
            id: "call_1".to_string(),
            name: "read_file".to_string(),
            arguments: "{\"path\":\"test.txt\"}".to_string(),
        }];

        let results = execute_tool_calls_core(&parsed, &executor, &cancel_token).await;
        assert_eq!(results.len(), 1);
        assert!(results[0].is_error);
        assert!(results[0].output.contains("Cancelled"));
    }

    /// Cancellation mid-loop: first call succeeds, then cancel, second call fails.
    #[tokio::test]
    async fn test_cancellation_mid_loop() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "file A").unwrap();
        std::fs::write(dir.path().join("b.txt"), "file B").unwrap();
        let executor = ToolExecutor::new(dir.path().to_path_buf());
        let cancel_token = CancellationToken::new();

        // First iteration succeeds
        let calls_1 = vec![ParsedToolCall {
            id: "call_1".to_string(),
            name: "read_file".to_string(),
            arguments: "{\"path\":\"a.txt\"}".to_string(),
        }];
        let results_1 = execute_tool_calls_core(&calls_1, &executor, &cancel_token).await;
        assert!(!results_1[0].is_error);
        assert!(results_1[0].output.contains("file A"));

        // Cancel between iterations
        cancel_token.cancel();

        // Second iteration should be cancelled
        let calls_2 = vec![ParsedToolCall {
            id: "call_2".to_string(),
            name: "read_file".to_string(),
            arguments: "{\"path\":\"b.txt\"}".to_string(),
        }];
        let results_2 = execute_tool_calls_core(&calls_2, &executor, &cancel_token).await;
        assert!(results_2[0].is_error);
        assert!(results_2[0].output.contains("Cancelled"));
    }

    // ─── Test: Multi-tool sequence (read → edit → verify) ────────────────────

    /// Simulates multiple tool loop iterations: read, edit, then verify the edit.
    #[tokio::test]
    async fn test_multi_tool_sequence() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("data.txt"), "original content").unwrap();

        let executor = ToolExecutor::new(dir.path().to_path_buf());
        let cancel_token = CancellationToken::new();

        // Iteration 1: read the file
        let read_calls = vec![ParsedToolCall {
            id: "call_1".to_string(),
            name: "read_file".to_string(),
            arguments: "{\"path\":\"data.txt\"}".to_string(),
        }];
        let read_results = execute_tool_calls_core(&read_calls, &executor, &cancel_token).await;
        assert!(!read_results[0].is_error);
        assert!(read_results[0].output.contains("original content"));

        // Iteration 2: edit the file
        let edit_calls = vec![ParsedToolCall {
            id: "call_2".to_string(),
            name: "edit_file".to_string(),
            arguments: "{\"path\":\"data.txt\",\"old_string\":\"original\",\"new_string\":\"modified\"}".to_string(),
        }];
        let edit_results = execute_tool_calls_core(&edit_calls, &executor, &cancel_token).await;
        assert!(!edit_results[0].is_error);

        // Iteration 3: verify the edit
        let verify_calls = vec![ParsedToolCall {
            id: "call_3".to_string(),
            name: "read_file".to_string(),
            arguments: "{\"path\":\"data.txt\"}".to_string(),
        }];
        let verify_results =
            execute_tool_calls_core(&verify_calls, &executor, &cancel_token).await;
        assert!(!verify_results[0].is_error);
        assert!(verify_results[0].output.contains("modified content"));
    }

    // ─── Test: Parallel reads in a single iteration ──────────────────────────

    /// Multiple read tools in one batch execute in parallel and return correct results.
    #[tokio::test]
    async fn test_parallel_reads_integration() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("a.txt"), "file A").unwrap();
        std::fs::write(dir.path().join("b.txt"), "file B").unwrap();
        std::fs::write(dir.path().join("c.txt"), "file C").unwrap();

        let executor = ToolExecutor::new(dir.path().to_path_buf());
        let cancel_token = CancellationToken::new();

        let calls = vec![
            ParsedToolCall {
                id: "c1".to_string(),
                name: "read_file".to_string(),
                arguments: "{\"path\":\"a.txt\"}".to_string(),
            },
            ParsedToolCall {
                id: "c2".to_string(),
                name: "read_file".to_string(),
                arguments: "{\"path\":\"b.txt\"}".to_string(),
            },
            ParsedToolCall {
                id: "c3".to_string(),
                name: "read_file".to_string(),
                arguments: "{\"path\":\"c.txt\"}".to_string(),
            },
        ];

        let results = execute_tool_calls_core(&calls, &executor, &cancel_token).await;
        assert_eq!(results.len(), 3);
        assert!(results[0].output.contains("file A"));
        assert!(results[1].output.contains("file B"));
        assert!(results[2].output.contains("file C"));
    }

    // ─── Test: SSE parsing → accumulation → execution full pipeline ──────────

    /// Full pipeline: raw SSE bytes → SseParser → delta accumulation → tool execution.
    #[tokio::test]
    async fn test_sse_to_execution_pipeline() {
        // Mock SSE data: OpenAI streaming response with a list_dir tool call
        let mut parser = parser_from_chunks(vec![
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_abc\",\"type\":\"function\",\"function\":{\"name\":\"list_dir\",\"arguments\":\"\"}}]}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"path\\\":\\\".\\\"}\"}}]}}]}\n",
            "data: [DONE]\n",
        ]);

        let cancel_token = CancellationToken::new();
        let mut pending: Vec<PendingToolCall> = Vec::new();

        // Parse SSE events and accumulate tool call deltas
        while let Some(event) = parser.next_event(&cancel_token).await {
            match event.unwrap() {
                SseEvent::Data(payload) => {
                    let value: Value = serde_json::from_str(&payload).unwrap();
                    if let Some(tc_array) = value
                        .get("choices")
                        .and_then(Value::as_array)
                        .and_then(|c| c.first())
                        .and_then(|c| c.get("delta"))
                        .and_then(|d| d.get("tool_calls"))
                        .and_then(Value::as_array)
                    {
                        for tc_delta in tc_array {
                            let index = tc_delta
                                .get("index")
                                .and_then(Value::as_u64)
                                .unwrap_or(0)
                                as usize;
                            let id =
                                tc_delta.get("id").and_then(Value::as_str).map(String::from);
                            let name = tc_delta
                                .get("function")
                                .and_then(|f| f.get("name"))
                                .and_then(Value::as_str)
                                .map(String::from);
                            let arguments = tc_delta
                                .get("function")
                                .and_then(|f| f.get("arguments"))
                                .and_then(Value::as_str)
                                .map(String::from);

                            accumulate_delta(
                                &mut pending,
                                ToolCallDelta {
                                    index,
                                    id,
                                    name,
                                    arguments,
                                },
                            );
                        }
                    }
                }
                SseEvent::Done => break,
                SseEvent::Event { .. } => {}
            }
        }

        // Finalize tool calls
        let parsed = finalize_tool_calls(pending);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].name, "list_dir");
        assert_eq!(parsed[0].id, "call_abc");
        assert_eq!(parsed[0].arguments, "{\"path\":\".\"}");

        // Execute against a real temp directory
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("test.rs"), "fn main() {}").unwrap();
        std::fs::create_dir(dir.path().join("src")).unwrap();

        let executor = ToolExecutor::new(dir.path().to_path_buf());
        let results = execute_tool_calls_core(&parsed, &executor, &cancel_token).await;
        assert_eq!(results.len(), 1);
        assert!(!results[0].is_error);
        assert!(results[0].output.contains("test.rs"));
    }

    // ─── Test: SSE with multiple tool calls in one response ──────────────────

    /// LLM returns multiple tool calls in a single response (parallel tool use).
    #[tokio::test]
    async fn test_sse_multiple_tool_calls() {
        let mut parser = parser_from_chunks(vec![
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"\"}},{\"index\":1,\"id\":\"call_2\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"\"}}]}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"path\\\":\\\"x.txt\\\"}\"}},{\"index\":1,\"function\":{\"arguments\":\"{\\\"path\\\":\\\"y.txt\\\"}\"}}]}}]}\n",
            "data: [DONE]\n",
        ]);

        let cancel_token = CancellationToken::new();
        let mut pending: Vec<PendingToolCall> = Vec::new();

        while let Some(event) = parser.next_event(&cancel_token).await {
            match event.unwrap() {
                SseEvent::Data(payload) => {
                    let value: Value = serde_json::from_str(&payload).unwrap();
                    if let Some(tc_array) = value
                        .get("choices")
                        .and_then(Value::as_array)
                        .and_then(|c| c.first())
                        .and_then(|c| c.get("delta"))
                        .and_then(|d| d.get("tool_calls"))
                        .and_then(Value::as_array)
                    {
                        for tc_delta in tc_array {
                            let index = tc_delta
                                .get("index")
                                .and_then(Value::as_u64)
                                .unwrap_or(0)
                                as usize;
                            let id =
                                tc_delta.get("id").and_then(Value::as_str).map(String::from);
                            let name = tc_delta
                                .get("function")
                                .and_then(|f| f.get("name"))
                                .and_then(Value::as_str)
                                .map(String::from);
                            let arguments = tc_delta
                                .get("function")
                                .and_then(|f| f.get("arguments"))
                                .and_then(Value::as_str)
                                .map(String::from);

                            accumulate_delta(
                                &mut pending,
                                ToolCallDelta {
                                    index,
                                    id,
                                    name,
                                    arguments,
                                },
                            );
                        }
                    }
                }
                SseEvent::Done => break,
                SseEvent::Event { .. } => {}
            }
        }

        let parsed = finalize_tool_calls(pending);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].id, "call_1");
        assert_eq!(parsed[0].arguments, "{\"path\":\"x.txt\"}");
        assert_eq!(parsed[1].id, "call_2");
        assert_eq!(parsed[1].arguments, "{\"path\":\"y.txt\"}");

        // Execute both
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("x.txt"), "content X").unwrap();
        std::fs::write(dir.path().join("y.txt"), "content Y").unwrap();

        let executor = ToolExecutor::new(dir.path().to_path_buf());
        let results = execute_tool_calls_core(&parsed, &executor, &cancel_token).await;
        assert_eq!(results.len(), 2);
        assert!(results[0].output.contains("content X"));
        assert!(results[1].output.contains("content Y"));
    }
}
