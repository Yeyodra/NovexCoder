use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use crate::tools::executor::{ToolCall, ToolExecutor, ToolName, ToolResult};

// ─── Core Structs ────────────────────────────────────────────────────────────

/// A parsed tool call from the LLM response (after accumulation is complete).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// Pending tool call being accumulated from streaming deltas.
#[derive(Debug, Clone, Default)]
pub struct PendingToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// Delta from OpenAI streaming (partial tool call data).
#[derive(Debug, Clone)]
pub struct ToolCallDelta {
    pub index: usize,
    pub id: Option<String>,
    pub name: Option<String>,
    pub arguments: Option<String>,
}

// ─── Event Payload ───────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolCallEvent {
    session_id: String,
    tool_call_id: String,
    tool_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_input: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    is_error: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<i64>,
}

// ─── Accumulation ────────────────────────────────────────────────────────────

/// Accumulate a streaming delta into the pending tool calls vector.
/// OpenAI sends tool_calls as array with index field — we accumulate by index.
pub fn accumulate_delta(pending: &mut Vec<PendingToolCall>, delta: ToolCallDelta) {
    while pending.len() <= delta.index {
        pending.push(PendingToolCall::default());
    }
    let entry = &mut pending[delta.index];
    if let Some(id) = delta.id {
        entry.id = id;
    }
    if let Some(name) = delta.name {
        entry.name = name;
    }
    if let Some(args) = delta.arguments {
        entry.arguments.push_str(&args);
    }
}

/// Convert accumulated pending tool calls into finalized ParsedToolCalls.
pub fn finalize_tool_calls(pending: Vec<PendingToolCall>) -> Vec<ParsedToolCall> {
    pending
        .into_iter()
        .filter(|p| !p.name.is_empty())
        .map(|p| ParsedToolCall {
            id: p.id,
            name: p.name,
            arguments: p.arguments,
        })
        .collect()
}

// ─── Tool Classification ─────────────────────────────────────────────────────

/// Map a tool name string to the ToolName enum.
pub fn map_tool_name(name: &str) -> Option<ToolName> {
    match name {
        "read_file" => Some(ToolName::ReadFile),
        "write_file" => Some(ToolName::WriteFile),
        "list_dir" => Some(ToolName::ListDir),
        "search_files" => Some(ToolName::SearchFiles),
        "run_command" => Some(ToolName::RunCommand),
        "web_search" => Some(ToolName::WebSearch),
        "fetch_url" => Some(ToolName::FetchUrl),
        "edit_file" => Some(ToolName::EditFile),
        "replace_in_file" => Some(ToolName::ReplaceInFile),
        "batch_read_files" => Some(ToolName::BatchReadFiles),
        _ => None,
    }
}

/// Returns true if the tool is read-only (safe for parallel execution).
pub fn is_read_tool(name: &str) -> bool {
    matches!(
        name,
        "read_file" | "list_dir" | "search_files" | "web_search" | "fetch_url" | "batch_read_files"
    )
}

// ─── Execution Orchestration ─────────────────────────────────────────────────

/// Execute a batch of parsed tool calls.
/// - Read-only tools run in parallel (via join_all)
/// - Write tools run sequentially
/// - Results returned in original order
pub async fn execute_tool_calls(
    tool_calls: &[ParsedToolCall],
    executor: &ToolExecutor,
    cancel_token: &CancellationToken,
    app_handle: &AppHandle,
    session_id: &str,
) -> Vec<ToolResult> {
    let mut results: Vec<Option<ToolResult>> = vec![None; tool_calls.len()];

    // Partition indices into read (parallel) and write (sequential) groups
    let mut read_indices: Vec<usize> = Vec::new();
    let mut write_indices: Vec<usize> = Vec::new();

    for (i, tc) in tool_calls.iter().enumerate() {
        if is_read_tool(&tc.name) {
            read_indices.push(i);
        } else {
            write_indices.push(i);
        }
    }

    // Execute read tools in parallel
    if !read_indices.is_empty() {
        let futures: Vec<_> = read_indices
            .iter()
            .map(|&i| {
                execute_single_tool_call(
                    &tool_calls[i],
                    executor,
                    cancel_token,
                    app_handle,
                    session_id,
                )
            })
            .collect();

        let read_results = futures_util::future::join_all(futures).await;
        for (idx, result) in read_indices.into_iter().zip(read_results) {
            results[idx] = Some(result);
        }
    }

    // Execute write tools sequentially
    for i in write_indices {
        let result = execute_single_tool_call(
            &tool_calls[i],
            executor,
            cancel_token,
            app_handle,
            session_id,
        )
        .await;
        results[i] = Some(result);
    }

    // Safety: all slots are filled because we iterate over every index exactly once
    // (read_indices + write_indices = 0..tool_calls.len()). The unwrap is safe.
    results.into_iter().map(|r| r.unwrap()).collect()
}

/// Core execution logic without event emission — used for testing.
/// Same parallel/sequential semantics as `execute_tool_calls`.
pub async fn execute_tool_calls_core(
    tool_calls: &[ParsedToolCall],
    executor: &ToolExecutor,
    cancel_token: &CancellationToken,
) -> Vec<ToolResult> {
    if tool_calls.is_empty() {
        return Vec::new();
    }

    let mut results: Vec<Option<ToolResult>> = vec![None; tool_calls.len()];

    // Partition indices into read (parallel) and write (sequential) groups
    let mut read_indices: Vec<usize> = Vec::new();
    let mut write_indices: Vec<usize> = Vec::new();

    for (i, tc) in tool_calls.iter().enumerate() {
        if is_read_tool(&tc.name) {
            read_indices.push(i);
        } else {
            write_indices.push(i);
        }
    }

    // Execute read tools in parallel
    if !read_indices.is_empty() {
        let futures: Vec<_> = read_indices
            .iter()
            .map(|&i| execute_single_tool_call_core(&tool_calls[i], executor, cancel_token))
            .collect();

        let read_results = futures_util::future::join_all(futures).await;
        for (idx, result) in read_indices.into_iter().zip(read_results) {
            results[idx] = Some(result);
        }
    }

    // Execute write tools sequentially
    for i in write_indices {
        let result =
            execute_single_tool_call_core(&tool_calls[i], executor, cancel_token).await;
        results[i] = Some(result);
    }

    // Safety: all slots are filled — read_indices + write_indices covers 0..len exactly once.
    results.into_iter().map(|r| r.unwrap()).collect()
}

/// Execute a single tool call without event emission (for testing).
async fn execute_single_tool_call_core(
    parsed: &ParsedToolCall,
    executor: &ToolExecutor,
    cancel_token: &CancellationToken,
) -> ToolResult {
    if cancel_token.is_cancelled() {
        return make_error_result(&parsed.name, "Cancelled");
    }

    let tool_name = match map_tool_name(&parsed.name) {
        Some(tn) => tn,
        None => {
            return make_error_result(&parsed.name, &format!("Unknown tool: {}", parsed.name));
        }
    };

    let input: serde_json::Value = match serde_json::from_str(&parsed.arguments) {
        Ok(v) => v,
        Err(e) => {
            return ToolResult {
                tool: tool_name,
                output: format!("Invalid arguments: {}", e),
                is_error: true,
            };
        }
    };

    let call = ToolCall {
        tool: tool_name,
        input,
    };
    executor.execute(call).await
}

/// Execute a single tool call with event emission and cancellation checking.
async fn execute_single_tool_call(
    parsed: &ParsedToolCall,
    executor: &ToolExecutor,
    cancel_token: &CancellationToken,
    app_handle: &AppHandle,
    session_id: &str,
) -> ToolResult {
    // Check cancellation before execution
    if cancel_token.is_cancelled() {
        return make_error_result(&parsed.name, "Cancelled");
    }

    // Resolve tool name
    let tool_name = match map_tool_name(&parsed.name) {
        Some(tn) => tn,
        None => {
            let error_msg = format!("Unknown tool: {}", parsed.name);
            emit_tool_error(app_handle, session_id, parsed, &error_msg);
            return make_error_result(&parsed.name, &error_msg);
        }
    };

    // Parse arguments
    let input: serde_json::Value = match serde_json::from_str(&parsed.arguments) {
        Ok(v) => v,
        Err(e) => {
            let error_msg = format!("Invalid arguments: {}", e);
            emit_tool_error(app_handle, session_id, parsed, &error_msg);
            return ToolResult {
                tool: tool_name,
                output: error_msg,
                is_error: true,
            };
        }
    };

    // Emit started event
    emit_tool_started(app_handle, session_id, parsed);

    // Execute
    let start = Instant::now();
    let call = ToolCall {
        tool: tool_name,
        input,
    };
    let result = executor.execute(call).await;
    let duration_ms = start.elapsed().as_millis() as i64;

    // Emit completed event
    emit_tool_completed(app_handle, session_id, parsed, &result, duration_ms);

    result
}

// ─── Event Emission Helpers ──────────────────────────────────────────────────

fn emit_tool_started(app_handle: &AppHandle, session_id: &str, parsed: &ParsedToolCall) {
    let event = ToolCallEvent {
        session_id: session_id.to_string(),
        tool_call_id: parsed.id.clone(),
        tool_name: parsed.name.clone(),
        tool_input: Some(parsed.arguments.clone()),
        tool_output: None,
        is_error: None,
        duration_ms: None,
    };
    app_handle.emit("chat-tool-call-started", &event).ok();
}

fn emit_tool_completed(
    app_handle: &AppHandle,
    session_id: &str,
    parsed: &ParsedToolCall,
    result: &ToolResult,
    duration_ms: i64,
) {
    let event = ToolCallEvent {
        session_id: session_id.to_string(),
        tool_call_id: parsed.id.clone(),
        tool_name: parsed.name.clone(),
        tool_input: None,
        tool_output: Some(result.output.clone()),
        is_error: Some(result.is_error),
        duration_ms: Some(duration_ms),
    };
    app_handle.emit("chat-tool-call-completed", &event).ok();
}

fn emit_tool_error(
    app_handle: &AppHandle,
    session_id: &str,
    parsed: &ParsedToolCall,
    error_msg: &str,
) {
    let event = ToolCallEvent {
        session_id: session_id.to_string(),
        tool_call_id: parsed.id.clone(),
        tool_name: parsed.name.clone(),
        tool_input: None,
        tool_output: Some(error_msg.to_string()),
        is_error: Some(true),
        duration_ms: None,
    };
    app_handle.emit("chat-tool-call-error", &event).ok();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Create an error ToolResult for cases where we can't even resolve the tool name.
fn make_error_result(name: &str, message: &str) -> ToolResult {
    // Default to ReadFile as a placeholder — the output carries the error info
    let tool = map_tool_name(name).unwrap_or(ToolName::ReadFile);
    ToolResult {
        tool,
        output: message.to_string(),
        is_error: true,
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::Instant;
    use tempfile::tempdir;

    /// Helper: create a ToolExecutor with a temp sandbox and pre-created test files.
    fn setup_executor_with_files(files: &[(&str, &str)]) -> (ToolExecutor, tempfile::TempDir) {
        let dir = tempdir().expect("failed to create temp dir");
        for (name, content) in files {
            let path = dir.path().join(name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).ok();
            }
            fs::write(&path, content).expect("failed to write test file");
        }
        let executor = ToolExecutor::new(dir.path().to_path_buf());
        (executor, dir)
    }

    /// Helper: create a ParsedToolCall for read_file.
    fn read_file_call(id: &str, path: &str) -> ParsedToolCall {
        ParsedToolCall {
            id: id.to_string(),
            name: "read_file".to_string(),
            arguments: format!("{{\"path\":\"{}\"}}", path),
        }
    }

    /// Helper: create a ParsedToolCall for write_file.
    fn write_file_call(id: &str, path: &str, content: &str) -> ParsedToolCall {
        ParsedToolCall {
            id: id.to_string(),
            name: "write_file".to_string(),
            arguments: format!("{{\"path\":\"{}\",\"content\":\"{}\"}}", path, content),
        }
    }

    #[test]
    fn test_accumulate_delta_single_tool() {
        let mut pending: Vec<PendingToolCall> = Vec::new();

        // First delta: id + name + partial args
        accumulate_delta(
            &mut pending,
            ToolCallDelta {
                index: 0,
                id: Some("call_123".to_string()),
                name: Some("read_file".to_string()),
                arguments: Some("{\"path\":".to_string()),
            },
        );

        // Second delta: more args
        accumulate_delta(
            &mut pending,
            ToolCallDelta {
                index: 0,
                id: None,
                name: None,
                arguments: Some("\"src/main.rs\"}".to_string()),
            },
        );

        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, "call_123");
        assert_eq!(pending[0].name, "read_file");
        assert_eq!(pending[0].arguments, "{\"path\":\"src/main.rs\"}");
    }

    #[test]
    fn test_accumulate_delta_multiple_tools() {
        let mut pending: Vec<PendingToolCall> = Vec::new();

        accumulate_delta(
            &mut pending,
            ToolCallDelta {
                index: 0,
                id: Some("call_1".to_string()),
                name: Some("read_file".to_string()),
                arguments: Some("{\"path\":\"a.rs\"}".to_string()),
            },
        );

        accumulate_delta(
            &mut pending,
            ToolCallDelta {
                index: 1,
                id: Some("call_2".to_string()),
                name: Some("list_dir".to_string()),
                arguments: Some("{\"path\":\"src\"}".to_string()),
            },
        );

        assert_eq!(pending.len(), 2);
        assert_eq!(pending[0].name, "read_file");
        assert_eq!(pending[1].name, "list_dir");
        assert_eq!(pending[1].id, "call_2");
    }

    #[test]
    fn test_finalize_filters_empty() {
        let pending = vec![
            PendingToolCall {
                id: "call_1".to_string(),
                name: "read_file".to_string(),
                arguments: "{}".to_string(),
            },
            PendingToolCall {
                id: String::new(),
                name: String::new(),
                arguments: String::new(),
            },
            PendingToolCall {
                id: "call_3".to_string(),
                name: "list_dir".to_string(),
                arguments: "{\"path\":\".\"}".to_string(),
            },
        ];

        let finalized = finalize_tool_calls(pending);
        assert_eq!(finalized.len(), 2);
        assert_eq!(finalized[0].name, "read_file");
        assert_eq!(finalized[1].name, "list_dir");
    }

    #[test]
    fn test_map_tool_name_known() {
        assert_eq!(map_tool_name("read_file"), Some(ToolName::ReadFile));
        assert_eq!(map_tool_name("write_file"), Some(ToolName::WriteFile));
        assert_eq!(map_tool_name("list_dir"), Some(ToolName::ListDir));
        assert_eq!(map_tool_name("search_files"), Some(ToolName::SearchFiles));
        assert_eq!(map_tool_name("run_command"), Some(ToolName::RunCommand));
        assert_eq!(map_tool_name("web_search"), Some(ToolName::WebSearch));
        assert_eq!(map_tool_name("fetch_url"), Some(ToolName::FetchUrl));
        assert_eq!(map_tool_name("edit_file"), Some(ToolName::EditFile));
        assert_eq!(
            map_tool_name("replace_in_file"),
            Some(ToolName::ReplaceInFile)
        );
        assert_eq!(
            map_tool_name("batch_read_files"),
            Some(ToolName::BatchReadFiles)
        );
    }

    #[test]
    fn test_map_tool_name_unknown() {
        assert_eq!(map_tool_name("nonexistent_tool"), None);
        assert_eq!(map_tool_name(""), None);
        assert_eq!(map_tool_name("ReadFile"), None);
    }

    #[test]
    fn test_is_read_tool() {
        // Read tools
        assert!(is_read_tool("read_file"));
        assert!(is_read_tool("list_dir"));
        assert!(is_read_tool("search_files"));
        assert!(is_read_tool("web_search"));
        assert!(is_read_tool("fetch_url"));
        assert!(is_read_tool("batch_read_files"));

        // Write tools
        assert!(!is_read_tool("write_file"));
        assert!(!is_read_tool("edit_file"));
        assert!(!is_read_tool("replace_in_file"));
        assert!(!is_read_tool("run_command"));

        // Unknown
        assert!(!is_read_tool("unknown"));
    }

    // ─── Parallel Execution Tests ────────────────────────────────────────────

    #[tokio::test]
    async fn test_empty_tool_calls() {
        let (executor, _dir) = setup_executor_with_files(&[]);
        let cancel_token = CancellationToken::new();

        let results = execute_tool_calls_core(&[], &executor, &cancel_token).await;
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_failure_does_not_cancel_others() {
        let (executor, _dir) = setup_executor_with_files(&[
            ("exists1.txt", "hello"),
            ("exists2.txt", "world"),
        ]);
        let cancel_token = CancellationToken::new();

        let tool_calls = vec![
            read_file_call("call_1", "exists1.txt"),
            read_file_call("call_2", "nonexistent.txt"),
            read_file_call("call_3", "exists2.txt"),
        ];

        let results = execute_tool_calls_core(&tool_calls, &executor, &cancel_token).await;

        assert_eq!(results.len(), 3);
        // First succeeds
        assert!(!results[0].is_error);
        assert!(results[0].output.contains("hello"));
        // Second fails (file not found)
        assert!(results[1].is_error);
        // Third succeeds despite second failing
        assert!(!results[2].is_error);
        assert!(results[2].output.contains("world"));
    }

    #[tokio::test]
    async fn test_mixed_read_write_ordering() {
        let (executor, dir) = setup_executor_with_files(&[
            ("file_a.txt", "content_a"),
            ("file_b.txt", "content_b"),
        ]);
        let cancel_token = CancellationToken::new();

        let tool_calls = vec![
            read_file_call("call_1", "file_a.txt"),       // read — parallel
            write_file_call("call_2", "new.txt", "new"),  // write — sequential
            read_file_call("call_3", "file_b.txt"),       // read — parallel
        ];

        let results = execute_tool_calls_core(&tool_calls, &executor, &cancel_token).await;

        assert_eq!(results.len(), 3);
        // Results are in original order
        assert!(!results[0].is_error, "read file_a should succeed");
        assert!(results[0].output.contains("content_a"));
        assert!(!results[1].is_error, "write new.txt should succeed");
        assert!(!results[2].is_error, "read file_b should succeed");
        assert!(results[2].output.contains("content_b"));

        // Verify the write actually happened
        let written = fs::read_to_string(dir.path().join("new.txt")).unwrap();
        assert_eq!(written, "new");
    }

    #[tokio::test]
    async fn test_all_read_tools_parallel() {
        // All reads — no sequential phase
        let (executor, _dir) = setup_executor_with_files(&[
            ("a.txt", "aaa"),
            ("b.txt", "bbb"),
            ("c.txt", "ccc"),
        ]);
        let cancel_token = CancellationToken::new();

        let tool_calls = vec![
            read_file_call("call_1", "a.txt"),
            read_file_call("call_2", "b.txt"),
            read_file_call("call_3", "c.txt"),
        ];

        let results = execute_tool_calls_core(&tool_calls, &executor, &cancel_token).await;

        assert_eq!(results.len(), 3);
        assert!(results[0].output.contains("aaa"));
        assert!(results[1].output.contains("bbb"));
        assert!(results[2].output.contains("ccc"));
    }

    #[tokio::test]
    async fn test_all_write_tools_sequential() {
        // All writes — no parallel phase
        let (executor, dir) = setup_executor_with_files(&[]);
        let cancel_token = CancellationToken::new();

        let tool_calls = vec![
            write_file_call("call_1", "w1.txt", "one"),
            write_file_call("call_2", "w2.txt", "two"),
            write_file_call("call_3", "w3.txt", "three"),
        ];

        let results = execute_tool_calls_core(&tool_calls, &executor, &cancel_token).await;

        assert_eq!(results.len(), 3);
        for r in &results {
            assert!(!r.is_error, "write should succeed: {}", r.output);
        }

        // Verify files written
        assert_eq!(fs::read_to_string(dir.path().join("w1.txt")).unwrap(), "one");
        assert_eq!(fs::read_to_string(dir.path().join("w2.txt")).unwrap(), "two");
        assert_eq!(
            fs::read_to_string(dir.path().join("w3.txt")).unwrap(),
            "three"
        );
    }

    #[tokio::test]
    async fn test_parallel_execution_timing() {
        // Create files that exist — read_file is fast but we can still verify
        // parallel execution by checking total time is not N * single_time.
        let (executor, _dir) = setup_executor_with_files(&[
            ("f1.txt", &"x".repeat(1000)),
            ("f2.txt", &"y".repeat(1000)),
            ("f3.txt", &"z".repeat(1000)),
        ]);
        let cancel_token = CancellationToken::new();

        // Time a single read
        let single_calls = vec![read_file_call("s1", "f1.txt")];
        let start = Instant::now();
        let _ = execute_tool_calls_core(&single_calls, &executor, &cancel_token).await;
        let single_duration = start.elapsed();

        // Time 3 parallel reads
        let parallel_calls = vec![
            read_file_call("p1", "f1.txt"),
            read_file_call("p2", "f2.txt"),
            read_file_call("p3", "f3.txt"),
        ];
        let start = Instant::now();
        let results = execute_tool_calls_core(&parallel_calls, &executor, &cancel_token).await;
        let parallel_duration = start.elapsed();

        assert_eq!(results.len(), 3);
        for r in &results {
            assert!(!r.is_error);
        }

        // Parallel should not take 3x the single duration.
        // We use a generous 2.5x threshold to avoid flaky tests.
        assert!(
            parallel_duration < single_duration * 3,
            "Parallel ({:?}) should be faster than 3x single ({:?})",
            parallel_duration,
            single_duration
        );
    }

    #[tokio::test]
    async fn test_cancellation_prevents_execution() {
        let (executor, _dir) = setup_executor_with_files(&[("a.txt", "data")]);
        let cancel_token = CancellationToken::new();
        cancel_token.cancel();

        let tool_calls = vec![read_file_call("call_1", "a.txt")];
        let results = execute_tool_calls_core(&tool_calls, &executor, &cancel_token).await;

        assert_eq!(results.len(), 1);
        assert!(results[0].is_error);
        assert!(results[0].output.contains("Cancelled"));
    }

    #[tokio::test]
    async fn test_unknown_tool_returns_error() {
        let (executor, _dir) = setup_executor_with_files(&[]);
        let cancel_token = CancellationToken::new();

        let tool_calls = vec![ParsedToolCall {
            id: "call_1".to_string(),
            name: "nonexistent_tool".to_string(),
            arguments: "{}".to_string(),
        }];

        let results = execute_tool_calls_core(&tool_calls, &executor, &cancel_token).await;

        assert_eq!(results.len(), 1);
        assert!(results[0].is_error);
        assert!(results[0].output.contains("Unknown tool"));
    }

    #[tokio::test]
    async fn test_invalid_arguments_returns_error() {
        let (executor, _dir) = setup_executor_with_files(&[]);
        let cancel_token = CancellationToken::new();

        let tool_calls = vec![ParsedToolCall {
            id: "call_1".to_string(),
            name: "read_file".to_string(),
            arguments: "not valid json".to_string(),
        }];

        let results = execute_tool_calls_core(&tool_calls, &executor, &cancel_token).await;

        assert_eq!(results.len(), 1);
        assert!(results[0].is_error);
        assert!(results[0].output.contains("Invalid arguments"));
    }

    // ── Additional Accumulation Edge Case Tests ──────────────────────────────

    #[test]
    fn test_accumulate_delta_out_of_order() {
        let mut pending: Vec<PendingToolCall> = Vec::new();

        // Delta at index 2 arrives first (skipping 0 and 1).
        accumulate_delta(
            &mut pending,
            ToolCallDelta {
                index: 2,
                id: Some("call_3".to_string()),
                name: Some("list_dir".to_string()),
                arguments: Some("{\"path\":\".\"}".to_string()),
            },
        );

        // Should have expanded to 3 entries (indices 0, 1, 2).
        assert_eq!(pending.len(), 3);
        // Indices 0 and 1 are default (empty).
        assert_eq!(pending[0].name, "");
        assert_eq!(pending[1].name, "");
        // Index 2 has the data.
        assert_eq!(pending[2].id, "call_3");
        assert_eq!(pending[2].name, "list_dir");
        assert_eq!(pending[2].arguments, "{\"path\":\".\"}");

        // Now fill in index 0.
        accumulate_delta(
            &mut pending,
            ToolCallDelta {
                index: 0,
                id: Some("call_1".to_string()),
                name: Some("read_file".to_string()),
                arguments: Some("{\"path\":\"a.rs\"}".to_string()),
            },
        );

        assert_eq!(pending.len(), 3);
        assert_eq!(pending[0].id, "call_1");
        assert_eq!(pending[0].name, "read_file");
    }

    #[test]
    fn test_accumulate_delta_repeated_index() {
        let mut pending: Vec<PendingToolCall> = Vec::new();

        // First delta at index 0 with partial args.
        accumulate_delta(
            &mut pending,
            ToolCallDelta {
                index: 0,
                id: Some("call_1".to_string()),
                name: Some("write_file".to_string()),
                arguments: Some("{\"path\":\"out.txt\"".to_string()),
            },
        );

        // Second delta at same index 0 — appends more args.
        accumulate_delta(
            &mut pending,
            ToolCallDelta {
                index: 0,
                id: None,
                name: None,
                arguments: Some(",\"content\":\"hel".to_string()),
            },
        );

        // Third delta at same index 0 — appends even more.
        accumulate_delta(
            &mut pending,
            ToolCallDelta {
                index: 0,
                id: None,
                name: None,
                arguments: Some("lo\"}".to_string()),
            },
        );

        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, "call_1");
        assert_eq!(pending[0].name, "write_file");
        assert_eq!(
            pending[0].arguments,
            "{\"path\":\"out.txt\",\"content\":\"hello\"}"
        );
    }

    #[test]
    fn test_finalize_preserves_order() {
        let pending = vec![
            PendingToolCall {
                id: "call_1".to_string(),
                name: "read_file".to_string(),
                arguments: "{\"path\":\"a.rs\"}".to_string(),
            },
            PendingToolCall {
                id: "call_2".to_string(),
                name: "write_file".to_string(),
                arguments: "{\"path\":\"b.rs\",\"content\":\"x\"}".to_string(),
            },
            PendingToolCall {
                id: "call_3".to_string(),
                name: "list_dir".to_string(),
                arguments: "{\"path\":\".\"}".to_string(),
            },
        ];

        let finalized = finalize_tool_calls(pending);
        assert_eq!(finalized.len(), 3);
        // Order must be preserved.
        assert_eq!(finalized[0].id, "call_1");
        assert_eq!(finalized[0].name, "read_file");
        assert_eq!(finalized[1].id, "call_2");
        assert_eq!(finalized[1].name, "write_file");
        assert_eq!(finalized[2].id, "call_3");
        assert_eq!(finalized[2].name, "list_dir");
    }

    #[test]
    fn test_finalize_with_gaps_from_out_of_order() {
        // Simulates what happens when index 2 arrives but index 1 never gets filled.
        let pending = vec![
            PendingToolCall {
                id: "call_1".to_string(),
                name: "read_file".to_string(),
                arguments: "{}".to_string(),
            },
            PendingToolCall {
                id: String::new(),
                name: String::new(), // Empty — never filled
                arguments: String::new(),
            },
            PendingToolCall {
                id: "call_3".to_string(),
                name: "list_dir".to_string(),
                arguments: "{\"path\":\".\"}".to_string(),
            },
        ];

        let finalized = finalize_tool_calls(pending);
        // Empty entry at index 1 should be filtered out.
        assert_eq!(finalized.len(), 2);
        assert_eq!(finalized[0].name, "read_file");
        assert_eq!(finalized[1].name, "list_dir");
    }
}
