CREATE TABLE IF NOT EXISTS custom_agents (
    id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    system_prompt TEXT NOT NULL,
    provider_id TEXT,
    model_id TEXT,
    is_selectable INTEGER NOT NULL DEFAULT 1,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_agents_agent_type ON custom_agents(agent_type);
CREATE INDEX IF NOT EXISTS idx_custom_agents_enabled ON custom_agents(is_enabled);

ALTER TABLE agent_configs ADD COLUMN is_selectable INTEGER NOT NULL DEFAULT 0;

UPDATE agent_configs SET is_selectable = 1 WHERE agent_type IN ('orchestrator', 'planner');
