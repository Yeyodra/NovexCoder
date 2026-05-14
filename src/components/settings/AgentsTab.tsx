import { useState, useEffect } from 'react';
import { AgentConfig, AgentType, AGENT_LABELS, CustomAgent } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { useCustomAgentStore } from '@/stores/useCustomAgentStore';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';
import {
  Robot,
  TreeStructure,
  Code,
  Terminal,
  ShieldCheck,
  MagnifyingGlass,
  PaintBrush,
  TestTube,
  Eye,
  BookOpen,
  Books,
  Plus,
  Trash,
} from '@phosphor-icons/react';

const AGENT_TYPES: AgentType[] = [
  'orchestrator',
  'planner',
  'coder_fe',
  'coder_be',
  'security',
  'ux_researcher',
  'ui_designer',
  'tester',
  'reviewer',
  'researcher',
  'librarian',
];

const AGENT_ICONS: Record<string, React.ElementType> = {
  orchestrator: Robot,
  planner: TreeStructure,
  coder_fe: Code,
  coder_be: Terminal,
  security: ShieldCheck,
  ux_researcher: MagnifyingGlass,
  ui_designer: PaintBrush,
  tester: TestTube,
  reviewer: Eye,
  researcher: BookOpen,
  librarian: Books,
};

type Selection =
  | { kind: 'builtin'; agentType: AgentType }
  | { kind: 'custom'; id: string }
  | { kind: 'new-custom' };

interface CustomAgentForm {
  name: string;
  description: string;
  systemPrompt: string;
  providerId: string | null;
  modelId: string | null;
  isSelectable: boolean;
}

const EMPTY_FORM: CustomAgentForm = {
  name: '',
  description: '',
  systemPrompt: '',
  providerId: null,
  modelId: null,
  isSelectable: false,
};

export function AgentsTab() {
  const { providers } = useSettingsStore();
  const { agentConfigs, setAgentConfigs, upsertAgentConfig } = useAgentStore();
  const { customAgents, setCustomAgents, addCustomAgent, updateCustomAgent, removeCustomAgent } =
    useCustomAgentStore();

  const [selection, setSelection] = useState<Selection>({ kind: 'builtin', agentType: 'orchestrator' });
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [localConfig, setLocalConfig] = useState<{ providerId: string | null; modelId: string | null }>({
    providerId: null,
    modelId: null,
  });
  const [customForm, setCustomForm] = useState<CustomAgentForm>(EMPTY_FORM);
  const [customModels, setCustomModels] = useState<string[]>([]);

  // Load agent configs on mount
  useEffect(() => {
    async function loadConfigs() {
      try {
        const configs = await invoke<AgentConfig[]>('list_agent_configs');
        setAgentConfigs(configs);
      } catch (err) {
        console.error('Failed to load agent configs:', err);
      }
    }
    loadConfigs();
  }, [setAgentConfigs]);

  // Load custom agents on mount
  useEffect(() => {
    async function loadCustomAgents() {
      try {
        const agents = await invoke<CustomAgent[]>('list_custom_agents');
        setCustomAgents(agents);
      } catch (err) {
        console.error('Failed to load custom agents:', err);
      }
    }
    loadCustomAgents();
  }, [setCustomAgents]);

  // Sync local config when selecting a built-in agent
  useEffect(() => {
    if (selection.kind !== 'builtin') return;
    const config = agentConfigs.find((c) => c.agentType === selection.agentType);
    if (config) {
      setLocalConfig({ providerId: config.providerId, modelId: config.modelId });
    } else {
      setLocalConfig({ providerId: null, modelId: null });
    }
  }, [selection, agentConfigs]);

  // Sync custom form when selecting a custom agent
  useEffect(() => {
    if (selection.kind === 'custom') {
      const agent = customAgents.find((a) => a.id === selection.id);
      if (agent) {
        setCustomForm({
          name: agent.name,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          providerId: agent.providerId,
          modelId: agent.modelId,
          isSelectable: agent.isSelectable,
        });
      }
    } else if (selection.kind === 'new-custom') {
      setCustomForm(EMPTY_FORM);
    }
  }, [selection, customAgents]);

  // Load models for built-in agent provider
  useEffect(() => {
    if (selection.kind !== 'builtin') return;
    async function loadModels() {
      if (!localConfig.providerId) {
        setModels([]);
        return;
      }
      try {
        const providerModels = await invoke<{ modelId: string; enabled: boolean }[]>('list_provider_models', {
          providerId: localConfig.providerId,
        });
        setModels(providerModels.filter((m) => m.enabled).map((m) => m.modelId));
      } catch (err) {
        console.error('Failed to load models for provider:', err);
        setModels([]);
      }
    }
    loadModels();
  }, [localConfig.providerId, selection.kind]);

  // Load models for custom agent provider
  useEffect(() => {
    if (selection.kind === 'builtin') return;
    async function loadCustomModels() {
      if (!customForm.providerId) {
        setCustomModels([]);
        return;
      }
      try {
        const providerModels = await invoke<{ modelId: string; enabled: boolean }[]>('list_provider_models', {
          providerId: customForm.providerId,
        });
        setCustomModels(providerModels.filter((m) => m.enabled).map((m) => m.modelId));
      } catch (err) {
        console.error('Failed to load models:', err);
        setCustomModels([]);
      }
    }
    loadCustomModels();
  }, [customForm.providerId, selection.kind]);

  // Built-in agent save
  const handleSaveBuiltin = async () => {
    if (selection.kind !== 'builtin') return;
    setLoading(true);
    try {
      const savedConfig = await invoke<AgentConfig>('upsert_agent_config', {
        agentType: selection.agentType,
        providerId: localConfig.providerId,
        modelId: localConfig.modelId,
      });
      upsertAgentConfig(savedConfig);
    } catch (err) {
      console.error('Failed to save agent config:', err);
    } finally {
      setLoading(false);
    }
  };

  // Toggle selectable for built-in agent
  const handleToggleBuiltinSelectable = async (isSelectable: boolean) => {
    if (selection.kind !== 'builtin') return;
    try {
      await invoke('toggle_agent_selectable', {
        agentType: selection.agentType,
        isSelectable,
      });
      // Reload configs to reflect change
      const configs = await invoke<AgentConfig[]>('list_agent_configs');
      setAgentConfigs(configs);
    } catch (err) {
      console.error('Failed to toggle selectable:', err);
    }
  };

  // Create custom agent
  const handleCreateCustom = async () => {
    if (!customForm.name.trim()) return;
    setLoading(true);
    try {
      const agent = await invoke<CustomAgent>('create_custom_agent', {
        name: customForm.name,
        description: customForm.description,
        systemPrompt: customForm.systemPrompt,
        providerId: customForm.providerId,
        modelId: customForm.modelId,
      });
      addCustomAgent(agent);
      if (customForm.isSelectable) {
        await invoke('toggle_custom_agent_selectable', { id: agent.id, isSelectable: true });
      }
      setSelection({ kind: 'custom', id: agent.id });
    } catch (err) {
      console.error('Failed to create custom agent:', err);
    } finally {
      setLoading(false);
    }
  };

  // Update custom agent
  const handleUpdateCustom = async () => {
    if (selection.kind !== 'custom') return;
    if (!customForm.name.trim()) return;
    setLoading(true);
    try {
      const agent = await invoke<CustomAgent>('update_custom_agent', {
        id: selection.id,
        name: customForm.name,
        description: customForm.description,
        systemPrompt: customForm.systemPrompt,
        providerId: customForm.providerId,
        modelId: customForm.modelId,
      });
      updateCustomAgent(selection.id, agent);
      await invoke('toggle_custom_agent_selectable', { id: selection.id, isSelectable: customForm.isSelectable });
    } catch (err) {
      console.error('Failed to update custom agent:', err);
    } finally {
      setLoading(false);
    }
  };

  // Delete custom agent
  const handleDeleteCustom = async () => {
    if (selection.kind !== 'custom') return;
    setLoading(true);
    try {
      await invoke('delete_custom_agent', { id: selection.id });
      removeCustomAgent(selection.id);
      setSelection({ kind: 'builtin', agentType: 'orchestrator' });
    } catch (err) {
      console.error('Failed to delete custom agent:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get selectable state for built-in agent
  const getBuiltinSelectable = (): boolean => {
    if (selection.kind !== 'builtin') return false;
    const config = agentConfigs.find((c) => c.agentType === selection.agentType);
    return config?.isSelectable ?? false;
  };

  // Determine right panel icon/title
  const getRightPanelHeader = () => {
    if (selection.kind === 'builtin') {
      const Icon = AGENT_ICONS[selection.agentType] || Robot;
      return { Icon, title: AGENT_LABELS[selection.agentType] || selection.agentType, subtitle: selection.agentType };
    }
    if (selection.kind === 'custom') {
      const agent = customAgents.find((a) => a.id === selection.id);
      return { Icon: Robot, title: agent?.name || 'Custom Agent', subtitle: agent?.agentType || 'custom' };
    }
    return { Icon: Plus, title: 'New Agent', subtitle: 'Create a custom agent' };
  };

  const header = getRightPanelHeader();
  const isBuiltinSelectable = getBuiltinSelectable();

  return (
    <div className="flex h-[500px] border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)]">
      {/* Left Panel */}
      <div className="w-1/3 border-r border-[var(--border)] flex flex-col bg-[var(--surface-2)]/30">
        {/* Built-in Agents Section */}
        <div className="p-3 border-b border-[var(--border)] text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Built-in Agents
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {AGENT_TYPES.map((type) => {
            const ItemIcon = AGENT_ICONS[type];
            const isSelected = selection.kind === 'builtin' && selection.agentType === type;
            return (
              <button
                key={type}
                onClick={() => setSelection({ kind: 'builtin', agentType: type })}
                className={cn(
                  'w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                  isSelected
                    ? 'bg-[var(--surface-3)] text-[var(--text)] font-medium'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                )}
              >
                <ItemIcon size={16} weight={isSelected ? 'duotone' : 'regular'} />
                <span>{AGENT_LABELS[type]}</span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--border)]" />

        {/* Custom Agents Section */}
        <div className="p-3 border-b border-[var(--border)] text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Custom Agents
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {customAgents.map((agent) => {
            const isSelected = selection.kind === 'custom' && selection.id === agent.id;
            return (
              <button
                key={agent.id}
                onClick={() => setSelection({ kind: 'custom', id: agent.id })}
                className={cn(
                  'w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors text-left',
                  isSelected
                    ? 'bg-[var(--surface-3)] text-[var(--text)] font-medium'
                    : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                )}
              >
                <Robot size={16} weight={isSelected ? 'duotone' : 'regular'} />
                <span className="truncate">{agent.name}</span>
              </button>
            );
          })}

          {/* Add Agent Button */}
          <button
            onClick={() => setSelection({ kind: 'new-custom' })}
            className={cn(
              'w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors text-left',
              selection.kind === 'new-custom'
                ? 'bg-[var(--surface-3)] text-[var(--text)] font-medium'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
            )}
          >
            <Plus size={16} weight="bold" />
            <span>Add Agent</span>
          </button>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border)] flex items-center space-x-3 bg-[var(--surface)]">
          <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center">
            <header.Icon size={20} weight="duotone" className="text-[var(--text)]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">{header.title}</h2>
            <p className="text-xs text-[var(--text-muted)] font-mono">{header.subtitle}</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1 overflow-y-auto bg-[var(--surface-2)]/10">
          {/* Built-in Agent Detail */}
          {selection.kind === 'builtin' && (
            <div className="space-y-4">
              {/* Selectable Toggle */}
              <div className="flex items-center justify-between p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg">
                <div>
                  <h3 className="text-sm font-medium text-[var(--text)]">Show in Chat Selector</h3>
                  <p className="text-xs text-[var(--text-muted)]">Make this agent available for direct chat</p>
                </div>
                <button
                  onClick={() => handleToggleBuiltinSelectable(!isBuiltinSelectable)}
                  className={cn(
                    'relative w-10 h-5 rounded-full transition-colors',
                    isBuiltinSelectable ? 'bg-[var(--accent)]' : 'bg-[var(--surface-3)]'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                      isBuiltinSelectable && 'translate-x-5'
                    )}
                  />
                </button>
              </div>

              {/* Model Override */}
              <div>
                <h3 className="text-sm font-medium text-[var(--text)] mb-1">Model Override</h3>
                <p className="text-xs text-[var(--text-muted)] mb-4">
                  Configure a specific provider and model for this agent. If left unconfigured, the agent will use the
                  default provider and model.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">
                    Provider
                  </label>
                  <select
                    value={localConfig.providerId || ''}
                    onChange={(e) =>
                      setLocalConfig((prev) => ({ ...prev, providerId: e.target.value || null, modelId: null }))
                    }
                    className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--text-subtle)] transition-colors appearance-none"
                  >
                    <option value="">Use Default Provider</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {localConfig.providerId && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">
                      Model
                    </label>
                    <select
                      value={localConfig.modelId || ''}
                      onChange={(e) => setLocalConfig((prev) => ({ ...prev, modelId: e.target.value || null }))}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--text-subtle)] transition-colors appearance-none"
                    >
                      <option value="" disabled>
                        Select a model
                      </option>
                      {models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {!localConfig.providerId && (
                <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 text-xs text-[var(--text-muted)] flex items-center space-x-2">
                  <Robot size={16} weight="duotone" />
                  <span>Currently using default provider model.</span>
                </div>
              )}
            </div>
          )}

          {/* Custom Agent Form (edit or create) */}
          {(selection.kind === 'custom' || selection.kind === 'new-custom') && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={customForm.name}
                  onChange={(e) => setCustomForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. DB Expert"
                  className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--text-subtle)] transition-colors placeholder:text-[var(--text-muted)]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">
                  Description
                </label>
                <input
                  type="text"
                  value={customForm.description}
                  onChange={(e) => setCustomForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Short description for orchestrator"
                  className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--text-subtle)] transition-colors placeholder:text-[var(--text-muted)]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">
                  System Prompt
                </label>
                <textarea
                  value={customForm.systemPrompt}
                  onChange={(e) => setCustomForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                  rows={6}
                  placeholder="You are a..."
                  className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--text-subtle)] transition-colors resize-none placeholder:text-[var(--text-muted)]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">
                  Provider
                </label>
                <select
                  value={customForm.providerId || ''}
                  onChange={(e) =>
                    setCustomForm((prev) => ({ ...prev, providerId: e.target.value || null, modelId: null }))
                  }
                  className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--text-subtle)] transition-colors appearance-none"
                >
                  <option value="">Use Default Provider</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {customForm.providerId && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[var(--text-subtle)] uppercase tracking-wider">Model</label>
                  <select
                    value={customForm.modelId || ''}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, modelId: e.target.value || null }))}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--text-subtle)] transition-colors appearance-none"
                  >
                    <option value="" disabled>
                      Select a model
                    </option>
                    {customModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Selectable Toggle */}
              <div className="flex items-center justify-between p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg">
                <div>
                  <h3 className="text-sm font-medium text-[var(--text)]">Show in Chat Selector</h3>
                  <p className="text-xs text-[var(--text-muted)]">Make this agent available for direct chat</p>
                </div>
                <button
                  onClick={() => setCustomForm((prev) => ({ ...prev, isSelectable: !prev.isSelectable }))}
                  className={cn(
                    'relative w-10 h-5 rounded-full transition-colors',
                    customForm.isSelectable ? 'bg-[var(--accent)]' : 'bg-[var(--surface-3)]'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                      customForm.isSelectable && 'translate-x-5'
                    )}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)] flex justify-between bg-[var(--surface)]">
          {/* Delete button for custom agents */}
          {selection.kind === 'custom' ? (
            <button
              onClick={handleDeleteCustom}
              disabled={loading}
              className="px-4 py-2 bg-red-500/10 text-red-400 text-sm font-medium rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Trash size={14} />
              <span>Delete</span>
            </button>
          ) : (
            <div />
          )}

          {/* Save / Create button */}
          {selection.kind === 'builtin' && (
            <button
              onClick={handleSaveBuiltin}
              disabled={loading || (localConfig.providerId !== null && localConfig.modelId === null)}
              className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Configuration'}
            </button>
          )}

          {selection.kind === 'new-custom' && (
            <button
              onClick={handleCreateCustom}
              disabled={loading || !customForm.name.trim()}
              className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Agent'}
            </button>
          )}

          {selection.kind === 'custom' && (
            <button
              onClick={handleUpdateCustom}
              disabled={loading || !customForm.name.trim()}
              className="px-4 py-2 bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
