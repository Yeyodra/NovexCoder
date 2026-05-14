pub mod orchestrator;
pub mod planner;
pub mod coder_fe;
pub mod coder_be;
pub mod security;
pub mod ux_researcher;
pub mod ui_designer;
pub mod tester;
pub mod reviewer;
pub mod researcher;
pub mod librarian;

pub fn get_prompt(agent_type: &str) -> Option<&'static str> {
    match agent_type {
        "orchestrator" => Some(orchestrator::SYSTEM_PROMPT),
        "planner" => Some(planner::SYSTEM_PROMPT),
        "coder_fe" => Some(coder_fe::SYSTEM_PROMPT),
        "coder_be" => Some(coder_be::SYSTEM_PROMPT),
        "security" => Some(security::SYSTEM_PROMPT),
        "ux_researcher" => Some(ux_researcher::SYSTEM_PROMPT),
        "ui_designer" => Some(ui_designer::SYSTEM_PROMPT),
        "tester" => Some(tester::SYSTEM_PROMPT),
        "reviewer" => Some(reviewer::SYSTEM_PROMPT),
        "researcher" => Some(researcher::SYSTEM_PROMPT),
        "librarian" => Some(librarian::SYSTEM_PROMPT),
        _ => None,
    }
}

/// Returns (system_prompt, optional_provider_id, optional_model_id) for a custom agent.
/// Returns None if agent_type is not found in custom_agents table.
pub async fn get_prompt_dynamic(
    db: &sqlx::SqlitePool,
    agent_type: &str,
) -> crate::error::AppResult<Option<(String, Option<String>, Option<String>)>> {
    let agent =
        crate::services::custom_agent_service::get_custom_agent_by_type(db, agent_type).await?;
    Ok(agent.map(|a| (a.system_prompt, a.provider_id, a.model_id)))
}
