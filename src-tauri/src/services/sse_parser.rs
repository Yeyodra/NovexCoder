use crate::error::AppError;
use futures_util::StreamExt;
use std::pin::Pin;
use tokio_util::sync::CancellationToken;

/// Represents a single parsed SSE event from the stream.
#[derive(Debug, Clone, PartialEq)]
pub enum SseEvent {
    /// A `data:` line payload (raw string, NOT parsed as JSON).
    Data(String),
    /// Stream termination: OpenAI `[DONE]` or Anthropic `message_stop`.
    Done,
    /// Anthropic-style event with explicit `event:` type and associated `data:`.
    Event { event_type: String, data: String },
}

type ByteStream = Pin<Box<dyn futures_util::Stream<Item = Result<Vec<u8>, String>> + Send>>;

/// Streaming SSE parser that wraps a `reqwest::Response` byte stream.
///
/// Handles chunked transfer encoding, line buffering, and cancellation.
pub struct SseParser {
    stream: ByteStream,
    line_buffer: String,
    /// Pending `event:` type waiting for its corresponding `data:` line.
    pending_event_type: Option<String>,
}

impl SseParser {
    /// Create a new SSE parser from a reqwest response.
    pub fn new(response: reqwest::Response) -> Self {
        let stream = response.bytes_stream().map(|result| match result {
            Ok(bytes) => Ok(bytes.to_vec()),
            Err(e) => Err(e.to_string()),
        });
        Self {
            stream: Box::pin(stream),
            line_buffer: String::new(),
            pending_event_type: None,
        }
    }

    /// Returns the next SSE event from the stream, respecting cancellation.
    ///
    /// Returns `None` when the stream ends naturally.
    /// Returns `Err(AppError::Cancelled)` if the cancel token fires.
    /// Returns `Err(AppError::Http(_))` on stream read errors.
    pub async fn next_event(
        &mut self,
        cancel_token: &CancellationToken,
    ) -> Option<Result<SseEvent, AppError>> {
        loop {
            // First, try to extract a complete line from the buffer.
            if let Some(event) = self.try_parse_line() {
                return Some(Ok(event));
            }

            // Need more data from the stream.
            tokio::select! {
                _ = cancel_token.cancelled() => {
                    return Some(Err(AppError::Cancelled));
                }
                chunk = self.stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            self.line_buffer.push_str(&String::from_utf8_lossy(&bytes));
                        }
                        Some(Err(e)) => {
                            return Some(Err(AppError::Http(e)));
                        }
                        None => {
                            // Stream ended. Process any remaining data in buffer.
                            if !self.line_buffer.is_empty() {
                                let remaining = std::mem::take(&mut self.line_buffer);
                                if let Some(event) = self.parse_single_line(&remaining) {
                                    return Some(Ok(event));
                                }
                            }
                            return None;
                        }
                    }
                }
            }
        }
    }

    /// Try to extract and parse complete lines from the buffer.
    fn try_parse_line(&mut self) -> Option<SseEvent> {
        loop {
            let pos = self.line_buffer.find('\n')?;
            let mut line = self.line_buffer[..pos].to_string();
            self.line_buffer.drain(..=pos);

            if line.ends_with('\r') {
                line.pop();
            }

            if let Some(event) = self.parse_single_line(&line) {
                return Some(event);
            }
        }
    }

    /// Parse a single SSE line into an event, if applicable.
    fn parse_single_line(&mut self, line: &str) -> Option<SseEvent> {
        let trimmed = line.trim();

        if trimmed.is_empty() {
            return None;
        }

        // Handle `event:` lines (Anthropic format).
        if let Some(event_name) = trimmed.strip_prefix("event:") {
            let event_name = event_name.trim();
            if event_name == "message_stop" {
                self.pending_event_type = None;
                return Some(SseEvent::Done);
            }
            self.pending_event_type = Some(event_name.to_string());
            return None;
        }

        // Handle `data:` lines.
        if let Some(payload_raw) = trimmed.strip_prefix("data:") {
            let payload = payload_raw.trim();

            // OpenAI [DONE] sentinel.
            if payload == "[DONE]" {
                self.pending_event_type = None;
                return Some(SseEvent::Done);
            }

            // If there's a pending event type, emit an Event variant.
            if let Some(event_type) = self.pending_event_type.take() {
                return Some(SseEvent::Event {
                    event_type,
                    data: payload.to_string(),
                });
            }

            return Some(SseEvent::Data(payload.to_string()));
        }

        // Skip lines that don't match known prefixes (comments, etc.).
        None
    }
}

#[cfg(test)]
impl SseParser {
    /// Create an SseParser from a mock byte stream (for use in integration tests).
    pub fn new_from_chunks(chunks: Vec<&str>) -> Self {
        use futures_util::stream;
        let byte_chunks: Vec<Result<Vec<u8>, String>> = chunks
            .into_iter()
            .map(|s| Ok(s.as_bytes().to_vec()))
            .collect();
        let stream = stream::iter(byte_chunks);
        Self {
            stream: Box::pin(stream),
            line_buffer: String::new(),
            pending_event_type: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::stream;

    /// Helper: create an SseParser from raw string chunks.
    fn parser_from_chunks(chunks: Vec<&str>) -> SseParser {
        let byte_chunks: Vec<Result<Vec<u8>, String>> = chunks
            .into_iter()
            .map(|s| Ok(s.as_bytes().to_vec()))
            .collect();

        let stream = stream::iter(byte_chunks);
        SseParser {
            stream: Box::pin(stream),
            line_buffer: String::new(),
            pending_event_type: None,
        }
    }

    #[tokio::test]
    async fn test_openai_data_lines() {
        let cancel = CancellationToken::new();
        let mut parser = parser_from_chunks(vec![
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n",
            "data: [DONE]\n",
        ]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(
            event,
            SseEvent::Data("{\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}".to_string())
        );

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(
            event,
            SseEvent::Data("{\"choices\":[{\"delta\":{\"content\":\" world\"}}]}".to_string())
        );

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_openai_done_detection() {
        let cancel = CancellationToken::new();
        let mut parser = parser_from_chunks(vec!["data: [DONE]\n"]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);

        // Stream should end after.
        assert!(parser.next_event(&cancel).await.is_none());
    }

    #[tokio::test]
    async fn test_empty_lines_skipped() {
        let cancel = CancellationToken::new();
        let mut parser = parser_from_chunks(vec![
            "\n",
            "\n",
            "data: {\"test\":true}\n",
            "\n",
            "data: [DONE]\n",
        ]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Data("{\"test\":true}".to_string()));

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_anthropic_event_data_pairs() {
        let cancel = CancellationToken::new();
        let mut parser = parser_from_chunks(vec![
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"Hi\"}}\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\" there\"}}\n",
            "event: message_stop\n",
        ]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(
            event,
            SseEvent::Event {
                event_type: "content_block_delta".to_string(),
                data: "{\"type\":\"content_block_delta\",\"delta\":{\"text\":\"Hi\"}}".to_string(),
            }
        );

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(
            event,
            SseEvent::Event {
                event_type: "content_block_delta".to_string(),
                data: "{\"type\":\"content_block_delta\",\"delta\":{\"text\":\" there\"}}"
                    .to_string(),
            }
        );

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_anthropic_message_stop() {
        let cancel = CancellationToken::new();
        let mut parser = parser_from_chunks(vec!["event: message_stop\n"]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_malformed_lines_skipped() {
        let cancel = CancellationToken::new();
        let mut parser = parser_from_chunks(vec![
            ": this is a comment\n",
            "invalid line without prefix\n",
            "data: valid payload\n",
            "random garbage\n",
            "data: [DONE]\n",
        ]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Data("valid payload".to_string()));

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_chunked_data_across_boundaries() {
        let cancel = CancellationToken::new();
        // Data split across multiple chunks.
        let mut parser = parser_from_chunks(vec![
            "dat",
            "a: {\"partial\"",
            ":true}\ndata: [DONE]\n",
        ]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Data("{\"partial\":true}".to_string()));

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_crlf_line_endings() {
        let cancel = CancellationToken::new();
        let mut parser = parser_from_chunks(vec![
            "data: hello\r\n",
            "data: [DONE]\r\n",
        ]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Data("hello".to_string()));

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_cancellation() {
        let cancel = CancellationToken::new();
        cancel.cancel(); // Pre-cancel.

        // Use a stream that would block forever.
        let stream = futures_util::stream::pending::<Result<Vec<u8>, String>>();
        let mut parser = SseParser {
            stream: Box::pin(stream),
            line_buffer: String::new(),
            pending_event_type: None,
        };

        let result = parser.next_event(&cancel).await.unwrap();
        assert!(matches!(result, Err(AppError::Cancelled)));
    }

    #[tokio::test]
    async fn test_stream_end_returns_none() {
        let cancel = CancellationToken::new();
        let mut parser = parser_from_chunks(vec![]);

        assert!(parser.next_event(&cancel).await.is_none());
    }

    #[tokio::test]
    async fn test_remaining_buffer_on_stream_end() {
        let cancel = CancellationToken::new();
        // Data without trailing newline — should still be processed on stream end.
        let mut parser = parser_from_chunks(vec!["data: final"]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Data("final".to_string()));

        assert!(parser.next_event(&cancel).await.is_none());
    }

    // ── Additional Edge Case Tests ───────────────────────────────────────────

    #[tokio::test]
    async fn test_multiple_data_lines_in_sequence() {
        let cancel = CancellationToken::new();
        // Multiple data: lines in a single chunk without empty line separators.
        // Each data: line should produce its own event.
        let mut parser = parser_from_chunks(vec![
            "data: first\ndata: second\ndata: third\ndata: [DONE]\n",
        ]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Data("first".to_string()));

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Data("second".to_string()));

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Data("third".to_string()));

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_very_large_payload() {
        let cancel = CancellationToken::new();
        // 100KB+ payload — should not crash or truncate.
        let large_value = "x".repeat(120_000);
        let chunk = format!("data: {}\ndata: [DONE]\n", large_value);
        let mut parser = parser_from_chunks(vec![&chunk]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Data(large_value));

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_data_with_special_characters() {
        let cancel = CancellationToken::new();
        // JSON with unicode, escaped newlines in values.
        let payload = r#"{"text":"Hello\nWorld","emoji":"🦀","quote":"she said \"hi\""}"#;
        let chunk = format!("data: {}\ndata: [DONE]\n", payload);
        let mut parser = parser_from_chunks(vec![&chunk]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Data(payload.to_string()));

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_anthropic_content_block_delta_sequence() {
        let cancel = CancellationToken::new();
        // Realistic Anthropic streaming sequence: message_start → content_block_start →
        // content_block_delta (multiple) → content_block_stop → message_stop
        let mut parser = parser_from_chunks(vec![
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_01\"}}\n",
            "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0}\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\"Hello\"}}\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"delta\":{\"text\":\" world\"}}\n",
            "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n",
            "event: message_stop\n",
        ]);

        // message_start event
        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(
            event,
            SseEvent::Event {
                event_type: "message_start".to_string(),
                data: "{\"type\":\"message_start\",\"message\":{\"id\":\"msg_01\"}}".to_string(),
            }
        );

        // content_block_start
        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(
            event,
            SseEvent::Event {
                event_type: "content_block_start".to_string(),
                data: "{\"type\":\"content_block_start\",\"index\":0}".to_string(),
            }
        );

        // content_block_delta #1
        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(
            event,
            SseEvent::Event {
                event_type: "content_block_delta".to_string(),
                data: "{\"type\":\"content_block_delta\",\"delta\":{\"text\":\"Hello\"}}".to_string(),
            }
        );

        // content_block_delta #2
        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(
            event,
            SseEvent::Event {
                event_type: "content_block_delta".to_string(),
                data: "{\"type\":\"content_block_delta\",\"delta\":{\"text\":\" world\"}}"
                    .to_string(),
            }
        );

        // content_block_stop
        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(
            event,
            SseEvent::Event {
                event_type: "content_block_stop".to_string(),
                data: "{\"type\":\"content_block_stop\",\"index\":0}".to_string(),
            }
        );

        // message_stop → Done
        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_data_with_colon_in_payload() {
        let cancel = CancellationToken::new();
        // Payload that itself contains "data:" — should not be re-parsed.
        let mut parser = parser_from_chunks(vec![
            "data: {\"url\":\"http://example.com:8080/path\"}\n",
            "data: [DONE]\n",
        ]);

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(
            event,
            SseEvent::Data("{\"url\":\"http://example.com:8080/path\"}".to_string())
        );

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Done);
    }

    #[tokio::test]
    async fn test_stream_error_propagation() {
        let cancel = CancellationToken::new();
        // Stream that yields an error after some data.
        let chunks: Vec<Result<Vec<u8>, String>> = vec![
            Ok(b"data: hello\n".to_vec()),
            Err("connection reset".to_string()),
        ];
        let stream = futures_util::stream::iter(chunks);
        let mut parser = SseParser {
            stream: Box::pin(stream),
            line_buffer: String::new(),
            pending_event_type: None,
        };

        let event = parser.next_event(&cancel).await.unwrap().unwrap();
        assert_eq!(event, SseEvent::Data("hello".to_string()));

        let result = parser.next_event(&cancel).await.unwrap();
        assert!(matches!(result, Err(AppError::Http(_))));
    }
}
