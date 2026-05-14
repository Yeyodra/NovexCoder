use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CustomAgent {
    pub id: String,
    pub agent_type: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub is_selectable: bool,
    pub is_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}
