use tauri::State;

use crate::{error::AppResult, models::SessionFolder, services::session_folder_service, state::AppState};

#[tauri::command]
pub async fn create_folder(state: State<'_, AppState>, project_id: String, name: String) -> AppResult<SessionFolder> {
    session_folder_service::create_folder(state.pool(), &project_id, &name).await
}

#[tauri::command]
pub async fn list_folders(state: State<'_, AppState>, project_id: String) -> AppResult<Vec<SessionFolder>> {
    session_folder_service::list_folders(state.pool(), &project_id).await
}

#[tauri::command]
pub async fn rename_folder(state: State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    session_folder_service::rename_folder(state.pool(), &id, &name).await
}

#[tauri::command]
pub async fn delete_folder(state: State<'_, AppState>, id: String) -> AppResult<()> {
    session_folder_service::delete_folder(state.pool(), &id).await
}

#[tauri::command]
pub async fn reorder_folders(state: State<'_, AppState>, folder_ids: Vec<String>) -> AppResult<()> {
    session_folder_service::reorder_folders(state.pool(), folder_ids).await
}
