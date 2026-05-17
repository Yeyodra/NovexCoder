use sqlx::SqlitePool;

use crate::{
    error::{AppError, AppResult},
    models::ChatToolCall,
};

use super::now_rfc3339;

pub async fn insert(pool: &SqlitePool, tool_call: &ChatToolCall) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO chat_tool_calls (id, session_id, message_id, tool_name, tool_input, tool_output, is_error, status, duration_ms, created_at, completed_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    )
    .bind(&tool_call.id)
    .bind(&tool_call.session_id)
    .bind(&tool_call.message_id)
    .bind(&tool_call.tool_name)
    .bind(&tool_call.tool_input)
    .bind(&tool_call.tool_output)
    .bind(tool_call.is_error)
    .bind(&tool_call.status)
    .bind(tool_call.duration_ms)
    .bind(&tool_call.created_at)
    .bind(&tool_call.completed_at)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn list_by_message(
    pool: &SqlitePool,
    message_id: &str,
) -> AppResult<Vec<ChatToolCall>> {
    let rows = sqlx::query_as::<_, ChatToolCall>(
        "SELECT id, session_id, message_id, tool_name, tool_input, tool_output, is_error, status, duration_ms, created_at, completed_at \
         FROM chat_tool_calls WHERE message_id = ?1 ORDER BY created_at ASC",
    )
    .bind(message_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

pub async fn update_status(pool: &SqlitePool, id: &str, status: &str) -> AppResult<()> {
    let result = sqlx::query("UPDATE chat_tool_calls SET status = ?1 WHERE id = ?2")
        .bind(status)
        .bind(id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "Chat tool call not found: {id}"
        )));
    }

    Ok(())
}

pub async fn update_result(
    pool: &SqlitePool,
    id: &str,
    output: &str,
    is_error: bool,
    duration_ms: i64,
) -> AppResult<()> {
    let now = now_rfc3339();
    let status = if is_error { "error" } else { "completed" };

    let result = sqlx::query(
        "UPDATE chat_tool_calls SET tool_output = ?1, is_error = ?2, status = ?3, duration_ms = ?4, completed_at = ?5 WHERE id = ?6",
    )
    .bind(output)
    .bind(is_error)
    .bind(status)
    .bind(duration_ms)
    .bind(&now)
    .bind(id)
    .execute(pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!(
            "Chat tool call not found: {id}"
        )));
    }

    Ok(())
}
