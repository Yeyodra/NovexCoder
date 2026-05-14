use tauri::State;

use crate::{
    error::AppResult,
    models::CustomAgent,
    services::custom_agent_service,
    state::AppState,
};

#[tauri::command]
pub async fn create_custom_agent(
    state: State<'_, AppState>,
    name: String,
    description: String,
    system_prompt: String,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> AppResult<CustomAgent> {
    custom_agent_service::create_custom_agent(
        state.pool(),
        &name,
        &description,
        &system_prompt,
        provider_id.as_deref(),
        model_id.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn list_custom_agents(state: State<'_, AppState>) -> AppResult<Vec<CustomAgent>> {
    custom_agent_service::list_custom_agents(state.pool()).await
}

#[tauri::command]
pub async fn update_custom_agent(
    state: State<'_, AppState>,
    id: String,
    name: String,
    description: String,
    system_prompt: String,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> AppResult<CustomAgent> {
    custom_agent_service::update_custom_agent(
        state.pool(),
        &id,
        &name,
        &description,
        &system_prompt,
        provider_id.as_deref(),
        model_id.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn delete_custom_agent(state: State<'_, AppState>, id: String) -> AppResult<()> {
    custom_agent_service::delete_custom_agent(state.pool(), &id).await
}

#[tauri::command]
pub async fn toggle_custom_agent_selectable(
    state: State<'_, AppState>,
    id: String,
    is_selectable: bool,
) -> AppResult<()> {
    custom_agent_service::toggle_custom_agent_selectable(state.pool(), &id, is_selectable).await
}
