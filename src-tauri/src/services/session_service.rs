use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::Session,
};

use super::now_rfc3339;

pub async fn create_session(db: &SqlitePool, project_id: &str, title: &str) -> AppResult<Session> {
    let project_exists =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(1) FROM projects WHERE id = ?1")
            .bind(project_id)
            .fetch_one(db)
            .await?;

    if project_exists == 0 {
        return Err(AppError::NotFound(format!(
            "Project not found: {project_id}"
        )));
    }

    let normalized_title = if title.trim().is_empty() {
        "New Chat".to_string()
    } else {
        title.trim().to_string()
    };

    let now = now_rfc3339();
    let session = Session {
        id: Uuid::new_v4().to_string(),
        project_id: project_id.to_string(),
        title: normalized_title,
        created_at: now.clone(),
        updated_at: now,
        is_pinned: false,
        is_archived: false,
        folder_id: None,
        parent_session_id: None,
        sort_order: 0,
    };

    sqlx::query(
        "INSERT INTO sessions (id, project_id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(&session.id)
    .bind(&session.project_id)
    .bind(&session.title)
    .bind(&session.created_at)
    .bind(&session.updated_at)
    .execute(db)
    .await?;

    Ok(session)
}

pub async fn list_sessions(db: &SqlitePool, project_id: &str) -> AppResult<Vec<Session>> {
    let sessions = sqlx::query_as::<_, Session>(
        "SELECT id, project_id, title, created_at, updated_at, is_pinned, is_archived, folder_id, parent_session_id, sort_order FROM sessions WHERE project_id = ?1 ORDER BY updated_at DESC",
    )
    .bind(project_id)
    .fetch_all(db)
    .await?;

    Ok(sessions)
}

pub async fn delete_session(db: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM sessions WHERE id = ?1")
        .bind(id)
        .execute(db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Session not found: {id}")));
    }

    Ok(())
}

pub async fn update_session_title(db: &SqlitePool, id: &str, title: &str) -> AppResult<()> {
    let normalized_title = title.trim();
    if normalized_title.is_empty() {
        return Err(AppError::Validation(
            "Session title cannot be empty".to_string(),
        ));
    }

    let now = now_rfc3339();
    let result = sqlx::query("UPDATE sessions SET title = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(normalized_title)
        .bind(&now)
        .bind(id)
        .execute(db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Session not found: {id}")));
    }

    Ok(())
}

pub async fn pin_session(db: &SqlitePool, id: &str, pinned: bool) -> AppResult<()> {
    let now = now_rfc3339();
    let result = sqlx::query("UPDATE sessions SET is_pinned = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(pinned)
        .bind(&now)
        .bind(id)
        .execute(db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Session not found: {id}")));
    }

    Ok(())
}

pub async fn archive_session(db: &SqlitePool, id: &str, archived: bool) -> AppResult<()> {
    let now = now_rfc3339();
    let result =
        sqlx::query("UPDATE sessions SET is_archived = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(archived)
            .bind(&now)
            .bind(id)
            .execute(db)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Session not found: {id}")));
    }

    Ok(())
}

pub async fn move_session_to_folder(
    db: &SqlitePool,
    id: &str,
    folder_id: Option<&str>,
) -> AppResult<()> {
    let now = now_rfc3339();
    let result = sqlx::query("UPDATE sessions SET folder_id = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(folder_id)
        .bind(&now)
        .bind(id)
        .execute(db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Session not found: {id}")));
    }

    Ok(())
}

pub async fn reorder_sessions(db: &SqlitePool, session_ids: Vec<String>) -> AppResult<()> {
    for (index, id) in session_ids.iter().enumerate() {
        sqlx::query("UPDATE sessions SET sort_order = ?1 WHERE id = ?2")
            .bind(index as i64)
            .bind(id)
            .execute(db)
            .await?;
    }

    Ok(())
}
