pub mod agent_service;
pub mod chat_service;
pub mod chat_tool_call_service;
pub mod custom_agent_service;
pub mod drawing_service;
pub mod model_service;
pub mod project_service;
pub mod provider_model_service;
pub mod provider_service;
pub mod session_folder_service;
pub mod session_service;
pub mod settings_service;
pub mod shell_service;
pub mod sse_parser;
pub mod terminal_service;
pub mod tool_call_service;

pub(crate) fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}
