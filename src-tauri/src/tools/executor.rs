use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::Duration;

use globset::GlobSet;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};

/// Maximum characters allowed in a tool result before truncation.
const MAX_TOOL_RESULT_CHARS: usize = 8000;

/// Truncate tool output to `MAX_TOOL_RESULT_CHARS`, respecting char boundaries.
fn truncate_result(output: String) -> String {
    if output.len() <= MAX_TOOL_RESULT_CHARS {
        return output;
    }
    // Find the nearest valid char boundary at or before MAX_TOOL_RESULT_CHARS
    let mut end = MAX_TOOL_RESULT_CHARS;
    while !output.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    let truncated = &output[..end];
    format!(
        "{truncated}\n\n[Output truncated — {} chars total, showing first {end} chars]",
        output.len()
    )
}

/// Per-tool timeout configuration.
fn tool_timeout(tool: &ToolName) -> Duration {
    match tool {
        ToolName::ReadFile => Duration::from_secs(10),
        ToolName::WriteFile => Duration::from_secs(10),
        ToolName::ListDir => Duration::from_secs(15),
        ToolName::SearchFiles => Duration::from_secs(30),
        ToolName::RunCommand => Duration::from_secs(60),
        ToolName::WebSearch => Duration::from_secs(30),
        ToolName::FetchUrl => Duration::from_secs(30),
        ToolName::EditFile => Duration::from_secs(10),
        ToolName::ReplaceInFile => Duration::from_secs(10),
        ToolName::BatchReadFiles => Duration::from_secs(30),
    }
}

/// Sensitive file patterns — built once, shared across all ToolExecutor instances.
static SENSITIVE_GLOBSET: OnceLock<GlobSet> = OnceLock::new();

fn sensitive_globset() -> &'static GlobSet {
    SENSITIVE_GLOBSET.get_or_init(|| {
        use globset::{GlobBuilder, GlobSetBuilder};
        let mut builder = GlobSetBuilder::new();
        let patterns = [
            ".env",
            ".env.*",
            "**/.env",
            "**/.env.*",
            "**/*.pem",
            "**/*.key",
            "**/.ssh/**",
        ];
        for pattern in patterns {
            if let Ok(glob) = GlobBuilder::new(pattern).build() {
                builder.add(glob);
            }
        }
        builder
            .build()
            .map_err(|error| format!("sensitive globset build failed: {error}"))
            .unwrap_or_else(|error| panic!("{}", error))
    })
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ToolName {
    ReadFile,
    WriteFile,
    ListDir,
    SearchFiles,
    RunCommand,
    WebSearch,
    FetchUrl,
    EditFile,
    ReplaceInFile,
    BatchReadFiles,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub tool: ToolName,
    pub input: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub tool: ToolName,
    pub output: String,
    pub is_error: bool,
}

#[derive(Debug, Clone)]
pub struct ToolExecutor {
    pub sandbox: PathBuf,
    pub command_timeout: Duration,
}

impl ToolExecutor {
    pub fn new(sandbox: PathBuf) -> Self {
        Self {
            sandbox,
            command_timeout: Duration::from_secs(60),
        }
    }

    fn normalize_relative(path: &Path) -> AppResult<PathBuf> {
        let mut normalized = PathBuf::new();
        for component in path.components() {
            match component {
                Component::CurDir => {}
                Component::ParentDir => {
                    if !normalized.pop() {
                        return Err(AppError::Validation(
                            "Path traversal is not allowed".to_string(),
                        ));
                    }
                }
                Component::Normal(seg) => normalized.push(seg),
                Component::Prefix(_) | Component::RootDir => {
                    return Err(AppError::Validation("Invalid relative path".to_string()));
                }
            }
        }
        Ok(normalized)
    }

    fn validate_path(&self, requested: &str) -> AppResult<PathBuf> {
        let sandbox_canonical = self.sandbox.canonicalize().map_err(AppError::from)?;

        let requested_path = if Path::new(requested).is_absolute() {
            PathBuf::from(requested)
        } else {
            self.sandbox.join(requested)
        };

        if requested_path.exists() {
            let canonical = requested_path.canonicalize().map_err(AppError::from)?;
            if !canonical.starts_with(&sandbox_canonical) {
                return Err(AppError::Validation(format!(
                    "Path '{}' is outside project sandbox",
                    requested
                )));
            }
            return Ok(canonical);
        }

        let rel_from_sandbox = requested_path
            .strip_prefix(&self.sandbox)
            .map_err(|_| {
                AppError::Validation(format!("Path '{}' is outside project sandbox", requested))
            })?
            .to_path_buf();
        let normalized_rel = Self::normalize_relative(&rel_from_sandbox)?;
        Ok(sandbox_canonical.join(normalized_rel))
    }

    fn is_sensitive_file(&self, path: &Path) -> bool {
        sensitive_globset().is_match(path)
    }

    pub async fn execute(&self, call: ToolCall) -> ToolResult {
        let tool = call.tool;
        let timeout_duration = tool_timeout(&tool);

        let result = tokio::time::timeout(timeout_duration, async {
            match &tool {
                ToolName::ReadFile => self.read_file(&call.input).await,
                ToolName::WriteFile => self.write_file(&call.input).await,
                ToolName::ListDir => self.list_dir(&call.input).await,
                ToolName::SearchFiles => self.search_files(&call.input).await,
                ToolName::RunCommand => self.run_command(&call.input).await,
                ToolName::WebSearch => self.web_search(&call.input).await,
                ToolName::FetchUrl => self.fetch_url(&call.input).await,
                ToolName::EditFile => self.edit_file(&call.input).await,
                ToolName::ReplaceInFile => self.replace_in_file(&call.input).await,
                ToolName::BatchReadFiles => self.batch_read_files(&call.input).await,
            }
        })
        .await;

        match result {
            Ok(Ok(output)) => ToolResult {
                tool,
                output: truncate_result(output),
                is_error: false,
            },
            Ok(Err(error)) => ToolResult {
                tool,
                output: error.to_string(),
                is_error: true,
            },
            Err(_) => ToolResult {
                tool,
                output: format!(
                    "Tool execution timed out after {}s",
                    timeout_duration.as_secs()
                ),
                is_error: true,
            },
        }
    }

    async fn read_file(&self, input: &serde_json::Value) -> AppResult<String> {
        let path_str = input["path"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'path' field".to_string()))?;
        let safe_path = self.validate_path(path_str)?;

        if self.is_sensitive_file(&safe_path) {
            return Err(AppError::Validation(format!(
                "Access denied: '{}' is a sensitive file",
                path_str
            )));
        }

        tokio::fs::read_to_string(&safe_path)
            .await
            .map_err(AppError::from)
    }

    async fn write_file(&self, input: &serde_json::Value) -> AppResult<String> {
        let path_str = input["path"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'path' field".to_string()))?;
        let content = input["content"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'content' field".to_string()))?;
        let safe_path = self.validate_path(path_str)?;

        if self.is_sensitive_file(&safe_path) {
            return Err(AppError::Validation(format!(
                "Access denied: '{}' is a sensitive file",
                path_str
            )));
        }

        if let Some(parent) = safe_path.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(AppError::from)?;
        }

        tokio::fs::write(&safe_path, content)
            .await
            .map_err(AppError::from)?;
        Ok(format!("Successfully wrote to {}", path_str))
    }

    async fn list_dir(&self, input: &serde_json::Value) -> AppResult<String> {
        let Some(path_str) = input["path"].as_str() else {
            return Err(AppError::Validation("Missing 'path' field".to_string()));
        };
        let safe_path = self.validate_path(path_str)?;
        let sandbox_canonical = self.sandbox.canonicalize().map_err(AppError::from)?;

        let mut entries = Vec::new();
        for entry_result in WalkDir::new(&safe_path).max_depth(3) {
            let entry = match entry_result {
                Ok(entry) => entry,
                Err(_) => continue,
            };

            let canonical = match entry.path().canonicalize() {
                Ok(canonical) => canonical,
                Err(_) => continue,
            };
            if !canonical.starts_with(&sandbox_canonical) {
                continue;
            }

            let rel = canonical
                .strip_prefix(&sandbox_canonical)
                .map_err(|e| AppError::Internal(format!("strip_prefix failed: {e}")))?;
            let kind = if entry.file_type().is_dir() {
                "dir"
            } else {
                "file"
            };
            entries.push(format!("[{}] {}", kind, rel.display()));
        }

        Ok(entries.join("\n"))
    }

    async fn search_files(&self, input: &serde_json::Value) -> AppResult<String> {
        let pattern_str = input["pattern"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'pattern' field".to_string()))?;
        let path_str = input["path"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'path' field".to_string()))?;
        let safe_path = self.validate_path(path_str)?;
        let sandbox_canonical = self.sandbox.canonicalize().map_err(AppError::from)?;
        let regex = Regex::new(pattern_str)
            .map_err(|error| AppError::Validation(format!("Invalid regex: {error}")))?;

        let mut results = Vec::new();
        for entry_result in WalkDir::new(&safe_path) {
            let entry = match entry_result {
                Ok(entry) => entry,
                Err(_) => continue,
            };
            if !entry.file_type().is_file() {
                continue;
            }

            let canonical = match entry.path().canonicalize() {
                Ok(canonical) => canonical,
                Err(_) => continue,
            };
            if !canonical.starts_with(&sandbox_canonical) {
                continue;
            }

            let content = match tokio::fs::read_to_string(&canonical).await {
                Ok(content) => content,
                Err(_) => continue,
            };

            for (line_index, line) in content.lines().enumerate() {
                if regex.is_match(line) {
                    let rel = canonical
                        .strip_prefix(&sandbox_canonical)
                        .map_err(|e| AppError::Internal(format!("strip_prefix failed: {e}")))?;
                    results.push(format!("{}:{}: {}", rel.display(), line_index + 1, line));
                    if results.len() >= 100 {
                        break;
                    }
                }
            }

            if results.len() >= 100 {
                break;
            }
        }

        if results.is_empty() {
            Ok("No matches found".to_string())
        } else {
            Ok(results.join("\n"))
        }
    }

    async fn run_command(&self, input: &serde_json::Value) -> AppResult<String> {
        let cmd = input["command"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'command' field".to_string()))?;

        // Platform-specific shell selection
        let mut command = if cfg!(target_os = "windows") {
            let mut cmd_process = Command::new("cmd");
            cmd_process.arg("/C").arg(cmd);
            cmd_process
        } else {
            let mut sh_process = Command::new("sh");
            sh_process.arg("-c").arg(cmd);
            sh_process
        };

        command
            .current_dir(&self.sandbox)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let child = command.spawn().map_err(AppError::from)?;

        match tokio::time::timeout(self.command_timeout, child.wait_with_output()).await {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                let exit_code = output.status.code().unwrap_or(-1);
                Ok(format!(
                    "exit_code: {}\nstdout:\n{}\nstderr:\n{}",
                    exit_code, stdout, stderr
                ))
            }
            Ok(Err(error)) => Err(AppError::from(error)),
            Err(_) => Err(AppError::Internal(format!(
                "Command timed out after {}s",
                self.command_timeout.as_secs()
            ))),
        }
    }

    async fn web_search(&self, input: &serde_json::Value) -> AppResult<String> {
        let query = input["query"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'query' field".to_string()))?;
        let client = reqwest::Client::new();
        let url = format!(
            "https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1",
            urlencoding::encode(query)
        );

        let response = client
            .get(&url)
            .header("User-Agent", "enowX-Coder/1.0")
            .send()
            .await
            .map_err(AppError::from)?;

        response.text().await.map_err(AppError::from)
    }

    async fn fetch_url(&self, input: &serde_json::Value) -> AppResult<String> {
        let url = input["url"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'url' field".to_string()))?;

        let client = reqwest::Client::new();
        let response = client
            .get(url)
            .timeout(Duration::from_secs(30))
            .header("User-Agent", "enowX-Coder/1.0")
            .send()
            .await
            .map_err(AppError::from)?;

        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        // Limit response body to 100KB
        let bytes = response.bytes().await.map_err(AppError::from)?;
        let limited = if bytes.len() > 100 * 1024 {
            &bytes[..100 * 1024]
        } else {
            &bytes[..]
        };
        let text = String::from_utf8_lossy(limited).to_string();

        // Strip HTML tags if content-type is HTML
        if content_type.contains("text/html") {
            let tag_regex = Regex::new(r"<[^>]*>")
                .map_err(|e| AppError::Internal(format!("Regex error: {e}")))?;
            let stripped = tag_regex.replace_all(&text, "");
            // Collapse multiple whitespace
            let ws_regex = Regex::new(r"\s+")
                .map_err(|e| AppError::Internal(format!("Regex error: {e}")))?;
            let cleaned = ws_regex.replace_all(&stripped, " ");
            Ok(cleaned.trim().to_string())
        } else {
            Ok(text)
        }
    }

    async fn edit_file(&self, input: &serde_json::Value) -> AppResult<String> {
        let path_str = input["path"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'path' field".to_string()))?;
        let old_string = input["old_string"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'old_string' field".to_string()))?;
        let new_string = input["new_string"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'new_string' field".to_string()))?;

        let safe_path = self.validate_path(path_str)?;

        if self.is_sensitive_file(&safe_path) {
            return Err(AppError::Validation(format!(
                "Access denied: '{}' is a sensitive file",
                path_str
            )));
        }

        let content = tokio::fs::read_to_string(&safe_path).await.map_err(AppError::from)?;

        let matches: Vec<_> = content.match_indices(old_string).collect();
        match matches.len() {
            0 => Err(AppError::Validation(
                "old_string not found in file".to_string(),
            )),
            1 => {
                let new_content = content.replacen(old_string, new_string, 1);
                tokio::fs::write(&safe_path, &new_content).await.map_err(AppError::from)?;
                Ok(format!("Successfully edited {}", path_str))
            }
            _ => Err(AppError::Validation(
                "Found multiple matches for old_string. Provide more context to make it unique."
                    .to_string(),
            )),
        }
    }

    async fn replace_in_file(&self, input: &serde_json::Value) -> AppResult<String> {
        let path_str = input["path"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'path' field".to_string()))?;
        let pattern_str = input["pattern"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'pattern' field".to_string()))?;
        let replacement = input["replacement"]
            .as_str()
            .ok_or_else(|| AppError::Validation("Missing 'replacement' field".to_string()))?;
        let count = input["count"].as_u64();

        let safe_path = self.validate_path(path_str)?;

        if self.is_sensitive_file(&safe_path) {
            return Err(AppError::Validation(format!(
                "Access denied: '{}' is a sensitive file",
                path_str
            )));
        }

        let regex = Regex::new(pattern_str)
            .map_err(|error| AppError::Validation(format!("Invalid regex: {error}")))?;

        let content = tokio::fs::read_to_string(&safe_path).await.map_err(AppError::from)?;

        let (new_content, replacements) = if let Some(max_count) = count {
            let mut result = content.clone();
            let mut replaced = 0u64;
            for _ in 0..max_count {
                if let Some(mat) = regex.find(&result) {
                    let start = mat.start();
                    let end = mat.end();
                    result = format!("{}{}{}", &result[..start], replacement, &result[end..]);
                    replaced += 1;
                } else {
                    break;
                }
            }
            (result, replaced)
        } else {
            let matches_count = regex.find_iter(&content).count() as u64;
            let result = regex.replace_all(&content, replacement).to_string();
            (result, matches_count)
        };

        tokio::fs::write(&safe_path, &new_content).await.map_err(AppError::from)?;
        Ok(format!("Replaced {} occurrences in {}", replacements, path_str))
    }

    async fn batch_read_files(&self, input: &serde_json::Value) -> AppResult<String> {
        let paths = input["paths"]
            .as_array()
            .ok_or_else(|| AppError::Validation("Missing 'paths' field (must be array)".to_string()))?;

        if paths.len() > 5 {
            return Err(AppError::Validation(
                "batch_read_files supports a maximum of 5 files per call".to_string(),
            ));
        }

        let mut output = String::new();
        for path_value in paths {
            let path_str = path_value
                .as_str()
                .ok_or_else(|| AppError::Validation("Each path must be a string".to_string()))?;

            let header = format!("--- file: {} ---\n", path_str);
            output.push_str(&header);

            match self.validate_path(path_str) {
                Ok(safe_path) => {
                    if self.is_sensitive_file(&safe_path) {
                        output.push_str("Error: Access denied - sensitive file\n\n");
                        continue;
                    }
                    match tokio::fs::read_to_string(&safe_path).await {
                        Ok(content) => {
                            let truncated = if content.len() > 4000 {
                                format!("{}...(truncated)", &content[..4000])
                            } else {
                                content
                            };
                            output.push_str(&truncated);
                            output.push_str("\n\n");
                        }
                        Err(e) => {
                            output.push_str(&format!("Error: {}\n\n", e));
                        }
                    }
                }
                Err(e) => {
                    output.push_str(&format!("Error: {}\n\n", e));
                }
            }
        }

        Ok(output)
    }

    pub fn requires_permission(&self, path: &str) -> bool {
        self.is_sensitive_file(Path::new(path))
    }

    pub fn is_outside_sandbox(&self, path: &str) -> bool {
        self.validate_path(path).is_err()
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Helpers ────────────────────────────────────────────────────────────────

    fn with_sandbox(test_name: &str) -> PathBuf {
        let base = PathBuf::from("/tmp");
        let path = base.join(format!("enowx-test-{}", test_name));
        if path.exists() {
            std::fs::remove_dir_all(&path).expect("cleanup sandbox");
        }
        std::fs::create_dir_all(&path).expect("create sandbox");
        path
    }

    fn cleanup(test_name: &str) {
        let path = PathBuf::from("/tmp").join(format!("enowx-test-{}", test_name));
        if path.exists() {
            std::fs::remove_dir_all(&path).ok();
        }
    }

    // ── Path Traversal ─────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_path_traversal_dots() {
        let sandbox_path = with_sandbox("path_traversal_dots");

        // Create a real file inside sandbox
        tokio::fs::write(sandbox_path.join("safe.txt"), "hello")
            .await
            .expect("create safe.txt");

        let executor = ToolExecutor::new(sandbox_path.clone());

        // Attempt traversal via relative path — should be rejected
        let call = ToolCall {
            tool: ToolName::ReadFile,
            input: serde_json::json!({ "path": "../../../../etc/passwd" }),
        };
        let result = executor.execute(call).await;
        assert!(
            result.is_error,
            "Path traversal with .. should be rejected, got: {}",
            result.output
        );

        cleanup("path_traversal_dots");
    }

    #[tokio::test]
    async fn test_path_traversal_absolute_escape() {
        let sandbox_path = with_sandbox("path_traversal_abs");

        tokio::fs::write(sandbox_path.join("safe.txt"), "hello")
            .await
            .expect("create safe.txt");

        let executor = ToolExecutor::new(sandbox_path);

        // Absolute path pointing outside sandbox
        let call = ToolCall {
            tool: ToolName::ReadFile,
            input: serde_json::json!({ "path": "/etc/passwd" }),
        };
        let result = executor.execute(call).await;
        assert!(
            result.is_error,
            "Absolute path outside sandbox should be rejected, got: {}",
            result.output
        );

        cleanup("path_traversal_abs");
    }

    #[tokio::test]
    async fn test_is_outside_sandbox() {
        let sandbox_path = with_sandbox("outside_sandbox");

        tokio::fs::write(sandbox_path.join("file.txt"), "data")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path);

        // Path inside sandbox
        assert!(!executor.is_outside_sandbox("file.txt"));
        assert!(!executor.is_outside_sandbox("subdir/file.txt"));

        // Path attempting escape via ..
        assert!(executor.is_outside_sandbox("../outside.txt"));
        assert!(executor.is_outside_sandbox("../../etc/passwd"));

        // Absolute path outside sandbox
        assert!(executor.is_outside_sandbox("/etc/shadow"));

        cleanup("outside_sandbox");
    }

    // ── Read / Write File ─────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_read_write_file_roundtrip() {
        let sandbox_path = with_sandbox("rw_roundtrip");

        tokio::fs::write(sandbox_path.join("hello.txt"), "initial")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path);

        // Write
        let call = ToolCall {
            tool: ToolName::WriteFile,
            input: serde_json::json!({
                "path": "hello.txt",
                "content": "updated content here"
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "write should succeed: {}", result.output);

        // Read back
        let call = ToolCall {
            tool: ToolName::ReadFile,
            input: serde_json::json!({ "path": "hello.txt" }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "read should succeed: {}", result.output);
        assert_eq!(result.output, "updated content here");

        cleanup("rw_roundtrip");
    }

    #[tokio::test]
    async fn test_write_file_creates_parent_dirs() {
        let sandbox_path = with_sandbox("rw_mkdirs");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::WriteFile,
            input: serde_json::json!({
                "path": "deeply/nested/dir/file.txt",
                "content": "nested data"
            }),
        };
        let result = executor.execute(call).await;
        assert!(
            !result.is_error,
            "write with nested dirs should succeed: {}",
            result.output
        );

        // Verify file exists by reading it back
        let call = ToolCall {
            tool: ToolName::ReadFile,
            input: serde_json::json!({ "path": "deeply/nested/dir/file.txt" }),
        };
        let result = executor.execute(call).await;
        assert_eq!(result.output, "nested data");

        cleanup("rw_mkdirs");
    }

    #[tokio::test]
    async fn test_read_missing_field() {
        let sandbox_path = with_sandbox("read_missing");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::ReadFile,
            input: serde_json::json!({ "wrong_field": "value" }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("Missing 'path' field"));

        cleanup("read_missing");
    }

    // ── List Directory ────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_list_dir() {
        let sandbox_path = with_sandbox("list_dir");

        tokio::fs::write(sandbox_path.join("file1.txt"), "a").await.unwrap();
        tokio::fs::write(sandbox_path.join("file2.rs"), "b").await.unwrap();
        tokio::fs::create_dir_all(sandbox_path.join("subdir")).await.unwrap();

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::ListDir,
            input: serde_json::json!({ "path": "." }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "list_dir should succeed: {}", result.output);
        assert!(result.output.contains("file1.txt"));
        assert!(result.output.contains("file2.rs"));
        assert!(result.output.contains("subdir"));

        // Each entry should have [dir] or [file] prefix
        for line in result.output.lines() {
            assert!(
                line.starts_with("[dir] ") || line.starts_with("[file] "),
                "Unexpected line format: {line}"
            );
        }

        cleanup("list_dir");
    }

    #[tokio::test]
    async fn test_list_dir_path_traversal_attack() {
        let sandbox_path = with_sandbox("list_dir_traversal");

        let executor = ToolExecutor::new(sandbox_path);

        // Attempt to list outside sandbox
        let call = ToolCall {
            tool: ToolName::ListDir,
            input: serde_json::json!({ "path": "../../.." }),
        };
        let result = executor.execute(call).await;
        assert!(
            result.is_error,
            "list_dir with traversal should be rejected: {}",
            result.output
        );

        cleanup("list_dir_traversal");
    }

    #[tokio::test]
    async fn test_list_dir_missing_path() {
        let sandbox_path = with_sandbox("list_dir_missing");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::ListDir,
            input: serde_json::json!({}),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("Missing 'path' field"));

        cleanup("list_dir_missing");
    }

    // ── Search Files ────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_search_files_match() {
        let sandbox_path = with_sandbox("search_files");

        tokio::fs::write(sandbox_path.join("test.rs"), "fn hello() {}")
            .await
            .expect("create test.rs");
        tokio::fs::write(sandbox_path.join("ignore.txt"), "no match here")
            .await
            .expect("create ignore.txt");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::SearchFiles,
            input: serde_json::json!({
                "pattern": "fn hello",
                "path": "."
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "search should succeed: {}", result.output);
        assert!(result.output.contains("test.rs"));
        assert!(result.output.contains("fn hello() {}"));
        assert!(!result.output.contains("ignore.txt"));

        cleanup("search_files");
    }

    #[tokio::test]
    async fn test_search_files_invalid_regex() {
        let sandbox_path = with_sandbox("search_invalid_regex");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::SearchFiles,
            input: serde_json::json!({
                "pattern": "[invalid regex",
                "path": "."
            }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("Invalid regex"));

        cleanup("search_invalid_regex");
    }

    #[tokio::test]
    async fn test_search_files_no_matches() {
        let sandbox_path = with_sandbox("search_no_match");

        tokio::fs::write(sandbox_path.join("file.txt"), "nothing to see")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::SearchFiles,
            input: serde_json::json!({
                "pattern": "NONEXISTENT_PATTERN_XYZ",
                "path": "."
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error);
        assert_eq!(result.output, "No matches found");

        cleanup("search_no_match");
    }

    // ── Sensitive File Detection ────────────────────────────────────────────

    #[test]
    fn test_requires_permission_env_files() {
        let executor = ToolExecutor::new(PathBuf::from("/tmp/sandbox"));

        // Should require permission
        assert!(executor.requires_permission(".env"));
        assert!(executor.requires_permission(".env.local"));
        assert!(executor.requires_permission(".env.production"));
        assert!(executor.requires_permission("config/.env"));
        assert!(executor.requires_permission("config/.env.local"));
    }

    #[test]
    fn test_requires_permission_crypto_files() {
        let executor = ToolExecutor::new(PathBuf::from("/tmp/sandbox"));

        assert!(executor.requires_permission("server.key"));
        assert!(executor.requires_permission("certs/server.key"));
        assert!(executor.requires_permission("server.pem"));
        assert!(executor.requires_permission("certs/server.pem"));
    }

    #[test]
    fn test_requires_permission_ssh_files() {
        let executor = ToolExecutor::new(PathBuf::from("/tmp/sandbox"));

        assert!(executor.requires_permission(".ssh/id_rsa"));
        assert!(executor.requires_permission(".ssh/config"));
        assert!(executor.requires_permission("home/user/.ssh/authorized_keys"));
    }

    #[test]
    fn test_does_not_require_permission_for_normal_files() {
        let executor = ToolExecutor::new(PathBuf::from("/tmp/sandbox"));

        assert!(!executor.requires_permission("src/main.rs"));
        assert!(!executor.requires_permission("package.json"));
        assert!(!executor.requires_permission("README.md"));
        assert!(!executor.requires_permission("Cargo.toml"));
        assert!(!executor.requires_permission("index.html"));
        assert!(!executor.requires_permission("data.txt"));
        assert!(!executor.requires_permission("config.yaml"));
    }

    // ── Run Command ──────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_run_command_success() {
        let sandbox_path = with_sandbox("run_cmd_success");

        tokio::fs::write(sandbox_path.join("hello.txt"), "world")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::RunCommand,
            input: serde_json::json!({ "command": "cat hello.txt" }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "command should succeed: {}", result.output);
        assert!(result.output.contains("stdout:"));
        assert!(result.output.contains("world"));

        cleanup("run_cmd_success");
    }

    #[tokio::test]
    async fn test_run_command_missing_field() {
        let sandbox_path = with_sandbox("run_cmd_missing");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::RunCommand,
            input: serde_json::json!({}),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("Missing 'command' field"));

        cleanup("run_cmd_missing");
    }

    #[tokio::test]
    async fn test_run_command_invalid_command() {
        let sandbox_path = with_sandbox("run_cmd_invalid");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::RunCommand,
            input: serde_json::json!({ "command": "nonexistent_command_xyz_12345" }),
        };
        let result = executor.execute(call).await;
        assert!(
            result.is_error,
            "invalid command should fail: {}",
            result.output
        );

        cleanup("run_cmd_invalid");
    }

    #[tokio::test]
    async fn test_run_command_timeout() {
        let sandbox_path = with_sandbox("run_cmd_timeout");

        let mut executor = ToolExecutor::new(sandbox_path);
        executor.command_timeout = Duration::from_millis(200);

        let call = ToolCall {
            tool: ToolName::RunCommand,
            input: serde_json::json!({ "command": "sleep 60" }),
        };
        let result = executor.execute(call).await;
        assert!(
            result.is_error,
            "timeout should trigger error: {}",
            result.output
        );
        assert!(result.output.contains("Command timed out"));
        assert!(result.output.contains("60s"));

        cleanup("run_cmd_timeout");
    }

    // ── validate_path edge cases ─────────────────────────────────────────────

    #[tokio::test]
    async fn test_validate_path_valid_nested() {
        let sandbox_path = with_sandbox("validate_nested");

        tokio::fs::create_dir_all(sandbox_path.join("a/b/c"))
            .await
            .unwrap();
        tokio::fs::write(sandbox_path.join("a/b/c/file.txt"), "data")
            .await
            .unwrap();

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::ReadFile,
            input: serde_json::json!({ "path": "a/b/c/file.txt" }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "should read nested file: {}", result.output);
        assert_eq!(result.output, "data");

        cleanup("validate_nested");
    }

    // ── normalize_relative edge cases ────────────────────────────────────────

    #[test]
    fn test_normalize_relative_curdir() {
        let result = ToolExecutor::normalize_relative(Path::new("./src/main.rs"));
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), Path::new("src/main.rs"));
    }

    #[test]
    fn test_normalize_relative_leading_dotdot() {
        let result = ToolExecutor::normalize_relative(Path::new("../outside"));
        assert!(result.is_err());
    }

    #[test]
    fn test_normalize_relative_deep_dotdot() {
        let result = ToolExecutor::normalize_relative(Path::new("a/b/../../c"));
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), Path::new("c"));
    }

    #[test]
    fn test_normalize_relative_normal_only() {
        let result = ToolExecutor::normalize_relative(Path::new("src/components/App.tsx"));
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), Path::new("src/components/App.tsx"));
    }

    // ── Truncation ───────────────────────────────────────────────────────────

    #[test]
    fn test_truncate_short_string() {
        let short = "hello world".to_string();
        let result = truncate_result(short.clone());
        assert_eq!(result, short);
    }

    #[test]
    fn test_truncate_long_string() {
        let long = "x".repeat(10_000);
        let result = truncate_result(long.clone());
        assert!(result.len() < long.len());
        assert!(result.starts_with("xxxx"));
        assert!(result.contains("[Output truncated"));
        assert!(result.contains("10000 chars total"));
        assert!(result.contains("showing first 8000 chars"));
    }

    #[test]
    fn test_truncate_char_boundary() {
        // Create a string with multi-byte chars (emoji = 4 bytes each)
        // Fill up to just before MAX so the cut lands mid-char
        let prefix = "a".repeat(MAX_TOOL_RESULT_CHARS - 2);
        let multi_byte = format!("{prefix}🦀🦀"); // 2 emojis = 8 bytes, total exceeds MAX
        let result = truncate_result(multi_byte);
        // Should not panic and should be valid UTF-8
        assert!(result.contains("[Output truncated"));
        // The truncated portion must be valid UTF-8 (this line would panic if not)
        let _ = result.as_str();
    }

    // ── Fetch URL ────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_fetch_url_invalid_url() {
        let sandbox_path = with_sandbox("fetch_url_invalid");
        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::FetchUrl,
            input: serde_json::json!({ "url": "not-a-valid-url" }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error, "invalid URL should fail: {}", result.output);

        cleanup("fetch_url_invalid");
    }

    #[tokio::test]
    async fn test_fetch_url_missing_field() {
        let sandbox_path = with_sandbox("fetch_url_missing");
        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::FetchUrl,
            input: serde_json::json!({}),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("Missing 'url' field"));

        cleanup("fetch_url_missing");
    }

    // ── Edit File ────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_edit_file_success() {
        let sandbox_path = with_sandbox("edit_file_success");

        tokio::fs::write(sandbox_path.join("target.txt"), "hello world foo bar")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path.clone());

        let call = ToolCall {
            tool: ToolName::EditFile,
            input: serde_json::json!({
                "path": "target.txt",
                "old_string": "foo bar",
                "new_string": "baz qux"
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "edit should succeed: {}", result.output);
        assert!(result.output.contains("Successfully edited"));

        let content = tokio::fs::read_to_string(sandbox_path.join("target.txt"))
            .await
            .unwrap();
        assert_eq!(content, "hello world baz qux");

        cleanup("edit_file_success");
    }

    #[tokio::test]
    async fn test_edit_file_not_found() {
        let sandbox_path = with_sandbox("edit_file_notfound");

        tokio::fs::write(sandbox_path.join("target.txt"), "hello world")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::EditFile,
            input: serde_json::json!({
                "path": "target.txt",
                "old_string": "NONEXISTENT",
                "new_string": "replacement"
            }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("old_string not found in file"));

        cleanup("edit_file_notfound");
    }

    #[tokio::test]
    async fn test_edit_file_multiple_matches() {
        let sandbox_path = with_sandbox("edit_file_multi");

        tokio::fs::write(sandbox_path.join("target.txt"), "foo foo foo")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::EditFile,
            input: serde_json::json!({
                "path": "target.txt",
                "old_string": "foo",
                "new_string": "bar"
            }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("multiple matches"));

        cleanup("edit_file_multi");
    }

    #[tokio::test]
    async fn test_edit_file_sandbox() {
        let sandbox_path = with_sandbox("edit_file_sandbox");
        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::EditFile,
            input: serde_json::json!({
                "path": "../../../etc/passwd",
                "old_string": "root",
                "new_string": "hacked"
            }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error, "sandbox escape should be rejected: {}", result.output);

        cleanup("edit_file_sandbox");
    }

    // ── Replace In File ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_replace_in_file_success() {
        let sandbox_path = with_sandbox("replace_success");

        tokio::fs::write(sandbox_path.join("data.txt"), "cat dog cat bird cat")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path.clone());

        let call = ToolCall {
            tool: ToolName::ReplaceInFile,
            input: serde_json::json!({
                "path": "data.txt",
                "pattern": "cat",
                "replacement": "fish"
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "replace should succeed: {}", result.output);
        assert!(result.output.contains("Replaced 3 occurrences"));

        let content = tokio::fs::read_to_string(sandbox_path.join("data.txt"))
            .await
            .unwrap();
        assert_eq!(content, "fish dog fish bird fish");

        cleanup("replace_success");
    }

    #[tokio::test]
    async fn test_replace_in_file_with_count() {
        let sandbox_path = with_sandbox("replace_count");

        tokio::fs::write(sandbox_path.join("data.txt"), "aaa bbb aaa ccc aaa")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path.clone());

        let call = ToolCall {
            tool: ToolName::ReplaceInFile,
            input: serde_json::json!({
                "path": "data.txt",
                "pattern": "aaa",
                "replacement": "zzz",
                "count": 2
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "replace should succeed: {}", result.output);
        assert!(result.output.contains("Replaced 2 occurrences"));

        let content = tokio::fs::read_to_string(sandbox_path.join("data.txt"))
            .await
            .unwrap();
        assert_eq!(content, "zzz bbb zzz ccc aaa");

        cleanup("replace_count");
    }

    #[tokio::test]
    async fn test_replace_in_file_invalid_regex() {
        let sandbox_path = with_sandbox("replace_bad_regex");

        tokio::fs::write(sandbox_path.join("data.txt"), "content")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::ReplaceInFile,
            input: serde_json::json!({
                "path": "data.txt",
                "pattern": "[invalid",
                "replacement": "x"
            }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("Invalid regex"));

        cleanup("replace_bad_regex");
    }

    // ── Batch Read Files ─────────────────────────────────────────────────────

    #[tokio::test]
    async fn test_batch_read_files_success() {
        let sandbox_path = with_sandbox("batch_read_success");

        tokio::fs::write(sandbox_path.join("a.txt"), "content_a").await.unwrap();
        tokio::fs::write(sandbox_path.join("b.txt"), "content_b").await.unwrap();
        tokio::fs::write(sandbox_path.join("c.txt"), "content_c").await.unwrap();

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::BatchReadFiles,
            input: serde_json::json!({
                "paths": ["a.txt", "b.txt", "c.txt"]
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "batch read should succeed: {}", result.output);
        assert!(result.output.contains("--- file: a.txt ---"));
        assert!(result.output.contains("content_a"));
        assert!(result.output.contains("--- file: b.txt ---"));
        assert!(result.output.contains("content_b"));
        assert!(result.output.contains("--- file: c.txt ---"));
        assert!(result.output.contains("content_c"));

        cleanup("batch_read_success");
    }

    #[tokio::test]
    async fn test_batch_read_files_max_limit() {
        let sandbox_path = with_sandbox("batch_read_limit");
        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::BatchReadFiles,
            input: serde_json::json!({
                "paths": ["a.txt", "b.txt", "c.txt", "d.txt", "e.txt", "f.txt"]
            }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("maximum of 5 files"));

        cleanup("batch_read_limit");
    }

    #[tokio::test]
    async fn test_batch_read_files_partial_failure() {
        let sandbox_path = with_sandbox("batch_read_partial");

        tokio::fs::write(sandbox_path.join("exists.txt"), "real content").await.unwrap();
        // "missing.txt" intentionally not created

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::BatchReadFiles,
            input: serde_json::json!({
                "paths": ["exists.txt", "missing.txt"]
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "partial failure should still succeed: {}", result.output);
        assert!(result.output.contains("real content"));
        assert!(result.output.contains("--- file: missing.txt ---"));
        assert!(result.output.contains("Error:"));

        cleanup("batch_read_partial");
    }

    // ── Additional Edge Case Tests for New Tools ─────────────────────────────

    #[tokio::test]
    async fn test_edit_file_empty_old_string() {
        let sandbox_path = with_sandbox("edit_empty_old");

        tokio::fs::write(sandbox_path.join("target.txt"), "some content")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::EditFile,
            input: serde_json::json!({
                "path": "target.txt",
                "old_string": "",
                "new_string": "replacement"
            }),
        };
        let result = executor.execute(call).await;
        // Empty old_string matches at every position — should report multiple matches error.
        assert!(result.is_error, "empty old_string should error: {}", result.output);
        assert!(result.output.contains("multiple matches"));

        cleanup("edit_empty_old");
    }

    #[tokio::test]
    async fn test_edit_file_empty_file() {
        let sandbox_path = with_sandbox("edit_empty_file");

        tokio::fs::write(sandbox_path.join("empty.txt"), "")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::EditFile,
            input: serde_json::json!({
                "path": "empty.txt",
                "old_string": "something",
                "new_string": "replacement"
            }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error, "edit on empty file should fail: {}", result.output);
        assert!(result.output.contains("old_string not found in file"));

        cleanup("edit_empty_file");
    }

    #[tokio::test]
    async fn test_replace_in_file_no_matches() {
        let sandbox_path = with_sandbox("replace_no_match");

        tokio::fs::write(sandbox_path.join("data.txt"), "hello world")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path.clone());

        let call = ToolCall {
            tool: ToolName::ReplaceInFile,
            input: serde_json::json!({
                "path": "data.txt",
                "pattern": "NONEXISTENT",
                "replacement": "x"
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "no matches is not an error: {}", result.output);
        assert!(result.output.contains("Replaced 0 occurrences"));

        // File content should be unchanged.
        let content = tokio::fs::read_to_string(sandbox_path.join("data.txt"))
            .await
            .unwrap();
        assert_eq!(content, "hello world");

        cleanup("replace_no_match");
    }

    #[tokio::test]
    async fn test_replace_in_file_with_count_limited() {
        let sandbox_path = with_sandbox("replace_count_limited");

        tokio::fs::write(sandbox_path.join("data.txt"), "foo bar foo baz foo qux foo")
            .await
            .expect("create file");

        let executor = ToolExecutor::new(sandbox_path.clone());

        // Replace only first 1 occurrence.
        let call = ToolCall {
            tool: ToolName::ReplaceInFile,
            input: serde_json::json!({
                "path": "data.txt",
                "pattern": "foo",
                "replacement": "XXX",
                "count": 1
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "replace should succeed: {}", result.output);
        assert!(result.output.contains("Replaced 1 occurrences"));

        let content = tokio::fs::read_to_string(sandbox_path.join("data.txt"))
            .await
            .unwrap();
        assert_eq!(content, "XXX bar foo baz foo qux foo");

        cleanup("replace_count_limited");
    }

    #[tokio::test]
    async fn test_batch_read_files_empty_array() {
        let sandbox_path = with_sandbox("batch_read_empty");
        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::BatchReadFiles,
            input: serde_json::json!({
                "paths": []
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "empty paths should succeed: {}", result.output);
        assert_eq!(result.output.trim(), "");

        cleanup("batch_read_empty");
    }

    #[tokio::test]
    async fn test_batch_read_files_truncation() {
        let sandbox_path = with_sandbox("batch_read_trunc");

        // Create a file with content > 4000 chars.
        let large_content = "y".repeat(5000);
        tokio::fs::write(sandbox_path.join("large.txt"), &large_content)
            .await
            .unwrap();

        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::BatchReadFiles,
            input: serde_json::json!({
                "paths": ["large.txt"]
            }),
        };
        let result = executor.execute(call).await;
        assert!(!result.is_error, "batch read should succeed: {}", result.output);
        // Should contain truncation indicator.
        assert!(result.output.contains("...(truncated)"));
        // Should NOT contain the full 5000 chars.
        assert!(!result.output.contains(&large_content));
        // Should contain exactly 4000 'y' chars before truncation marker.
        let y_count = result.output.matches('y').count();
        assert_eq!(y_count, 4000);

        cleanup("batch_read_trunc");
    }

    #[tokio::test]
    async fn test_fetch_url_unreachable() {
        let sandbox_path = with_sandbox("fetch_url_unreachable");
        let executor = ToolExecutor::new(sandbox_path);

        // Use a non-routable IP to trigger a connection timeout/error.
        let call = ToolCall {
            tool: ToolName::FetchUrl,
            input: serde_json::json!({ "url": "http://192.0.2.1:1" }),
        };
        let result = executor.execute(call).await;
        assert!(
            result.is_error,
            "unreachable URL should fail: {}",
            result.output
        );

        cleanup("fetch_url_unreachable");
    }

    #[tokio::test]
    async fn test_edit_file_missing_fields() {
        let sandbox_path = with_sandbox("edit_missing_fields");

        tokio::fs::write(sandbox_path.join("file.txt"), "content")
            .await
            .unwrap();

        let executor = ToolExecutor::new(sandbox_path);

        // Missing old_string
        let call = ToolCall {
            tool: ToolName::EditFile,
            input: serde_json::json!({
                "path": "file.txt",
                "new_string": "replacement"
            }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("Missing 'old_string' field"));

        // Missing new_string
        let call = ToolCall {
            tool: ToolName::EditFile,
            input: serde_json::json!({
                "path": "file.txt",
                "old_string": "content"
            }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("Missing 'new_string' field"));

        cleanup("edit_missing_fields");
    }

    #[tokio::test]
    async fn test_replace_in_file_missing_fields() {
        let sandbox_path = with_sandbox("replace_missing_fields");

        tokio::fs::write(sandbox_path.join("file.txt"), "content")
            .await
            .unwrap();

        let executor = ToolExecutor::new(sandbox_path);

        // Missing pattern
        let call = ToolCall {
            tool: ToolName::ReplaceInFile,
            input: serde_json::json!({
                "path": "file.txt",
                "replacement": "x"
            }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("Missing 'pattern' field"));

        // Missing replacement
        let call = ToolCall {
            tool: ToolName::ReplaceInFile,
            input: serde_json::json!({
                "path": "file.txt",
                "pattern": "content"
            }),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("Missing 'replacement' field"));

        cleanup("replace_missing_fields");
    }

    #[tokio::test]
    async fn test_batch_read_files_missing_paths_field() {
        let sandbox_path = with_sandbox("batch_read_no_paths");
        let executor = ToolExecutor::new(sandbox_path);

        let call = ToolCall {
            tool: ToolName::BatchReadFiles,
            input: serde_json::json!({}),
        };
        let result = executor.execute(call).await;
        assert!(result.is_error);
        assert!(result.output.contains("Missing 'paths' field"));

        cleanup("batch_read_no_paths");
    }
}
