use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub sort_order: i64,
    pub icon: Option<String>,
    pub color: Option<String>,
}
