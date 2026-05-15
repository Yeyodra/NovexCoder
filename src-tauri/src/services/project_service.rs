use sqlx::SqlitePool;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::Project,
};

use super::now_rfc3339;

pub async fn create_project(db: &SqlitePool, name: &str, path: Option<&str>) -> AppResult<Project> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err(AppError::Validation(
            "Project name cannot be empty".to_string(),
        ));
    }

    let now = now_rfc3339();
    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: trimmed_name.to_string(),
        path: path.map(std::string::ToString::to_string),
        created_at: now.clone(),
        updated_at: now,
        sort_order: 0,
        icon: None,
        color: None,
    };

    sqlx::query(
        "INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(&project.id)
    .bind(&project.name)
    .bind(&project.path)
    .bind(&project.created_at)
    .bind(&project.updated_at)
    .execute(db)
    .await?;

    Ok(project)
}

pub async fn list_projects(db: &SqlitePool) -> AppResult<Vec<Project>> {
    let projects = sqlx::query_as::<_, Project>(
        "SELECT id, name, path, created_at, updated_at, sort_order, icon, color FROM projects ORDER BY updated_at DESC",
    )
    .fetch_all(db)
    .await?;

    Ok(projects)
}

pub async fn delete_project(db: &SqlitePool, id: &str) -> AppResult<()> {
    let result = sqlx::query("DELETE FROM projects WHERE id = ?1")
        .bind(id)
        .execute(db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Project not found: {id}")));
    }

    Ok(())
}

pub async fn reorder_projects(db: &SqlitePool, project_ids: Vec<String>) -> AppResult<()> {
    for (index, id) in project_ids.iter().enumerate() {
        sqlx::query("UPDATE projects SET sort_order = ?1 WHERE id = ?2")
            .bind(index as i64)
            .bind(id)
            .execute(db)
            .await?;
    }

    Ok(())
}

pub async fn update_project_meta(
    db: &SqlitePool,
    id: &str,
    icon: Option<&str>,
    color: Option<&str>,
) -> AppResult<()> {
    let now = now_rfc3339();
    let result =
        sqlx::query("UPDATE projects SET icon = ?1, color = ?2, updated_at = ?3 WHERE id = ?4")
            .bind(icon)
            .bind(color)
            .bind(&now)
            .bind(id)
            .execute(db)
            .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("Project not found: {id}")));
    }

    Ok(())
}
