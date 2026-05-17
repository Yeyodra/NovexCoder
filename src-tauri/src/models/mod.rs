pub mod agent_config;
pub mod agent_run;
pub mod custom_agent;
pub mod message;
pub mod project;
pub mod provider;
pub mod provider_model;
pub mod session;
pub mod session_folder;
pub mod drawing;
pub mod shell;
pub mod chat_tool_call;
pub mod tool_call;

pub use agent_config::AgentConfig;
pub use chat_tool_call::ChatToolCall;
pub use custom_agent::CustomAgent;
pub use drawing::Drawing;
pub use agent_run::AgentRun;
pub use message::Message;
pub use project::Project;
pub use provider::{fixed_base_url, Provider};
pub use provider_model::ProviderModelConfig;
pub use session::Session;
pub use session_folder::SessionFolder;
pub use shell::ShellInfo;
pub use tool_call::ToolCall;


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_project_serialization() {
        let p = Project {
            id: "test-id".to_string(),
            name: "test-project".to_string(),
            path: Some("/home/test/project".to_string()),
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-01T00:00:00Z".to_string(),
            sort_order: 0,
            icon: None,
            color: None,
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("test-project"));
    }
}
