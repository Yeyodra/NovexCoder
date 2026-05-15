use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_pinned: bool,
    pub is_archived: bool,
    pub folder_id: Option<String>,
    pub parent_session_id: Option<String>,
    pub sort_order: i64,
}
