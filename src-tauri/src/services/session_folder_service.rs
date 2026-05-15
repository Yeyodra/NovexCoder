use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::SessionFolder,
};

use super::now_rfc3339;

pub async fn create_folder(
    db: &SqlitePool,
    project_id: &str,
    name: &str,
) -> AppResult<SessionFolder> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err(AppError::Validation(
            "Folder name cannot be empty".to_string(),
        ));
    }

    let max_order: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(sort_order) FROM session_folders WHERE project_id = ?1",
    )
    .bind(project_id)
    .fetch_one(db)
    .await?;

    let sort_order = max_order.unwrap_or(0) + 1;
    let now = now_rfc3339();

    let folder = SessionFolder {
        id: Uuid::new_v4().to_string(),
        project_id: project_id.to_string(),
        name: trimmed_name.to_string(),
        sort_order,
        created_at: now.clone(),
        updated_at: now,
    };

    sqlx::query(
        "INSERT INTO session_folders (id, project_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )
    .bind(&folder.id)
    .bind(&folder.project_id)
    .bind(&folder.name)
    .bind(folder.sort_order)
    .bind(&folder.created_at)
    .bind(&folder.updated_at)
    .execute(db)
    .await?;

    Ok(folder)
}

pub async fn list_folders(db: &SqlitePool, project_id: &str) -> AppResult<Vec<SessionFolder>> {
    let folders = sqlx::query_as::<_, SessionFolder>(
        "SELECT id, project_id, name, sort_order, created_at, updated_at FROM session_folders WHERE project_id = ?1 ORDER BY sort_order ASC",
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;

    Ok(folders)
}

pub async fn rename_folder(db: &SqlitePool, id: &str, name: &str) -> AppResult<()> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err(AppError::Validation(
            "Folder name cannot be empty".to_string(),
        ));
    }

    let now = now_rfc3339();
    let result = sqlx::query("UPDATE session_folders SET name = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(trimmed_name)
        .bind(&now)
        .bind(id)
        .execute(db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Folder not found: {id}")));
    }

    Ok(())
}

pub async fn delete_folder(db: &SqlitePool, id: &str) -> AppResult<()> {
    // Unlink sessions from this folder first
    sqlx::query("UPDATE sessions SET folder_id = NULL WHERE folder_id = ?1")
        .bind(id)
        .execute(db)
        .await?;

    let result = sqlx::query("DELETE FROM session_folders WHERE id = ?1")
        .bind(id)
        .execute(db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Folder not found: {id}")));
    }

    Ok(())
}

pub async fn reorder_folders(db: &SqlitePool, folder_ids: Vec<String>) -> AppResult<()> {
    for (index, id) in folder_ids.iter().enumerate() {
        sqlx::query("UPDATE session_folders SET sort_order = ?1 WHERE id = ?2")
            .bind(index as i64)
            .bind(id)
            .execute(db)
            .await?;
    }

    Ok(())
}
