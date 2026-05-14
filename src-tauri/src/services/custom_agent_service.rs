use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::CustomAgent,
};

use super::now_rfc3339;

const CUSTOM_AGENT_SELECT: &str = "id, agent_type, name, description, system_prompt, provider_id, model_id, is_selectable, is_enabled, created_at, updated_at";

const BUILT_IN_AGENT_TYPES: &[&str] = &[
    "orchestrator",
    "planner",
    "coder_fe",
    "coder_be",
    "security",
    "ux_researcher",
    "ui_designer",
    "tester",
    "reviewer",
    "researcher",
    "librarian",
];

fn generate_agent_type_slug(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();

    // Collapse multiple underscores
    let mut collapsed = String::with_capacity(slug.len());
    let mut prev_underscore = false;
    for c in slug.chars() {
        if c == '_' {
            if !prev_underscore {
                collapsed.push(c);
            }
            prev_underscore = true;
        } else {
            collapsed.push(c);
            prev_underscore = false;
        }
    }

    // Trim leading/trailing underscores
    let trimmed = collapsed.trim_matches('_');

    format!("custom_{trimmed}")
}

pub async fn create_custom_agent(
    db: &SqlitePool,
    name: &str,
    description: &str,
    system_prompt: &str,
    provider_id: Option<&str>,
    model_id: Option<&str>,
) -> AppResult<CustomAgent> {
    let agent_type = generate_agent_type_slug(name);

    // Validate against built-in types
    let slug_without_prefix = agent_type.strip_prefix("custom_").unwrap_or(&agent_type);
    if BUILT_IN_AGENT_TYPES.contains(&slug_without_prefix) {
        return Err(AppError::Validation(format!(
            "Agent type '{slug_without_prefix}' conflicts with a built-in agent type"
        )));
    }

    let id = Uuid::new_v4().to_string();
    let now = now_rfc3339();

    sqlx::query(
        "INSERT INTO custom_agents (id, agent_type, name, description, system_prompt, provider_id, model_id, is_selectable, is_enabled, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    )
    .bind(&id)
    .bind(&agent_type)
    .bind(name)
    .bind(description)
    .bind(system_prompt)
    .bind(provider_id)
    .bind(model_id)
    .bind(true)
    .bind(true)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            AppError::Validation(format!(
                "Agent type '{agent_type}' already exists"
            ))
        } else {
            AppError::Database(e.to_string())
        }
    })?;

    get_custom_agent(db, &id).await?.ok_or_else(|| {
        AppError::Internal(format!(
            "Failed to fetch created custom agent after insert: {id}"
        ))
    })
}

pub async fn list_custom_agents(db: &SqlitePool) -> AppResult<Vec<CustomAgent>> {
    let agents = sqlx::query_as::<_, CustomAgent>(&format!(
        "SELECT {CUSTOM_AGENT_SELECT} FROM custom_agents ORDER BY created_at ASC"
    ))
    .fetch_all(db)
    .await?;

    Ok(agents)
}

pub async fn get_custom_agent(db: &SqlitePool, id: &str) -> AppResult<Option<CustomAgent>> {
    let agent = sqlx::query_as::<_, CustomAgent>(&format!(
        "SELECT {CUSTOM_AGENT_SELECT} FROM custom_agents WHERE id = ?1"
    ))
    .bind(id)
    .fetch_optional(db)
    .await?;

    Ok(agent)
}

pub async fn get_custom_agent_by_type(
    db: &SqlitePool,
    agent_type: &str,
) -> AppResult<Option<CustomAgent>> {
    let agent = sqlx::query_as::<_, CustomAgent>(&format!(
        "SELECT {CUSTOM_AGENT_SELECT} FROM custom_agents WHERE agent_type = ?1"
    ))
    .bind(agent_type)
    .fetch_optional(db)
    .await?;

    Ok(agent)
}

pub async fn update_custom_agent(
    db: &SqlitePool,
    id: &str,
    name: &str,
    description: &str,
    system_prompt: &str,
    provider_id: Option<&str>,
    model_id: Option<&str>,
) -> AppResult<CustomAgent> {
    let now = now_rfc3339();

    let result = sqlx::query(
        "UPDATE custom_agents SET name = ?1, description = ?2, system_prompt = ?3, provider_id = ?4, model_id = ?5, updated_at = ?6 WHERE id = ?7",
    )
    .bind(name)
    .bind(description)
    .bind(system_prompt)
    .bind(provider_id)
    .bind(model_id)
    .bind(&now)
    .bind(id)
    .execute(db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Custom agent not found: {id}")));
    }

    get_custom_agent(db, id).await?.ok_or_else(|| {
        AppError::Internal(format!(
            "Failed to fetch updated custom agent: {id}"
        ))
    })
}

pub async fn delete_custom_agent(db: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM custom_agents WHERE id = ?1")
        .bind(id)
        .execute(db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Custom agent not found: {id}")));
    }

    Ok(())
}

pub async fn list_enabled_custom_agents(db: &SqlitePool) -> AppResult<Vec<CustomAgent>> {
    let agents = sqlx::query_as::<_, CustomAgent>(&format!(
        "SELECT {CUSTOM_AGENT_SELECT} FROM custom_agents WHERE is_enabled = 1 ORDER BY created_at ASC LIMIT 20"
    ))
    .fetch_all(db)
    .await?;

    Ok(agents)
}

pub async fn toggle_custom_agent_selectable(
    db: &SqlitePool,
    id: &str,
    is_selectable: bool,
) -> AppResult<()> {
    let result = sqlx::query("UPDATE custom_agents SET is_selectable = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(is_selectable)
        .bind(now_rfc3339())
        .bind(id)
        .execute(db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Custom agent not found: {id}")));
    }

    Ok(())
}
