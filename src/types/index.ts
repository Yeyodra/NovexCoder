export interface Project {
  id: string;
  name: string;
  path?: string;
  createdAt: string;
  updatedAt: string;
  sortOrder: number;
  icon: string | null;
  color: string | null;
}

export interface Session {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
  isArchived: boolean;
  folderId: string | null;
  parentSessionId: string | null;
  sortOrder: number;
}

export interface SessionFolder {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {

  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface Provider {
  id: string;
  name: string;
  providerType: string; // e.g., 'openai', 'anthropic', 'ollama'
  baseUrl: string;
  apiKey?: string;
  model: string;
  isDefault: boolean;
  isBuiltin: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderModelConfig {
  id: string;
  providerId: string;
  modelId: string;
  enabled: boolean;
  maxTokens: number;
  temperature: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRun {
  id: string;
  sessionId: string;
  agentType: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: string;
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  parentAgentRunId?: string | null;
  projectPath?: string | null;
}

export type BuiltinAgentType =
  | 'orchestrator'
  | 'planner'
  | 'coder_fe'
  | 'coder_be'
  | 'security'
  | 'ux_researcher'
  | 'ui_designer'
  | 'tester'
  | 'reviewer'
  | 'researcher'
  | 'librarian';

export type AgentType = BuiltinAgentType | (string & {});

export const AGENT_LABELS: Record<string, string> = {
  orchestrator: 'Orchestrator',
  planner: 'Planner',
  coder_fe: 'Coder FE',
  coder_be: 'Coder BE',
  security: 'Security',
  ux_researcher: 'UX Researcher',
  ui_designer: 'UI Designer',
  tester: 'Tester',
  reviewer: 'Reviewer',
  researcher: 'Researcher',
  librarian: 'Librarian',
};

export interface AgentConfig {
  id: string;
  agentType: AgentType;
  providerId: string | null;
  modelId: string | null;
  isSelectable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomAgent {
  id: string;
  agentType: string;
  name: string;
  description: string;
  systemPrompt: string;
  providerId: string | null;
  modelId: string | null;
  isSelectable: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SelectableAgent {
  agentType: string;
  name: string;
  isCustom: boolean;
}

export interface ToolCall {
  id: string;
  agentRunId: string;
  toolName: 'read_file' | 'write_file' | 'list_dir' | 'search_files' | 'run_command' | 'web_search';
  input: string;
  output: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface AgentRunWithTools extends AgentRun {
  toolCalls: ToolCall[];
  streamingText: string;
  thinkingBlocks: string[];
  parentAgentRunId: string | null;
  projectPath: string | null;
}

export interface PermissionRequest {
  type: 'sensitive_file' | 'outside_sandbox';
  path: string;
  agentType: AgentType;
  agentRunId: string;
}

export interface ChatToolCall {
  id: string;
  sessionId: string;
  messageId: string;
  toolName: string;
  toolInput: string;
  toolOutput: string | null;
  isError: boolean;
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}
