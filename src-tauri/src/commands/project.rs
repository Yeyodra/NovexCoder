use tauri::State;

use crate::{error::AppResult, models::Project, services::project_service, state::AppState};

#[tauri::command]
pub async fn create_project(
    state: State<'_, AppState>,
    name: String,
    path: Option<String>,
) -> AppResult<Project> {
    project_service::create_project(state.pool(), &name, path.as_deref()).await
}

#[tauri::command]
pub async fn list_projects(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    project_service::list_projects(state.pool()).await
}

#[tauri::command]
pub async fn delete_project(state: State<'_, AppState>, id: String) -> AppResult<()> {
    project_service::delete_project(state.pool(), &id).await
}

#[tauri::command]
pub async fn reorder_projects(
    state: State<'_, AppState>,
    project_ids: Vec<String>,
) -> AppResult<()> {
    project_service::reorder_projects(state.pool(), project_ids).await
}

#[tauri::command]
pub async fn update_project_meta(
    state: State<'_, AppState>,
    id: String,
    icon: Option<String>,
    color: Option<String>,
) -> AppResult<()> {
    project_service::update_project_meta(state.pool(), &id, icon.as_deref(), color.as_deref()).await
}
