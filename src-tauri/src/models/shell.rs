use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub id: String,
    pub name: String,
    pub path: String,
}
