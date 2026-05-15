import React, { useRef, useEffect, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Icon } from '@/components/icon/Icon';
import { useChatStore } from '@/stores/useChatStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { ProviderModelConfig, SelectableAgent, AGENT_LABELS } from '@/types';
import { cn } from '@/lib/utils';

export interface ChatInputBarHandle {
  prefill: (text: string) => void;
}

interface ChatInputBarProps {
  onSend: (content: string) => void;
  onStop?: () => void;
}

const MAX_HEIGHT = 200;

export const ChatInputBar = React.forwardRef<ChatInputBarHandle, ChatInputBarProps>(({ onSend, onStop }, ref) => {
  const { isStreaming } = useChatStore();
  const hasRunningAgent = useAgentStore((s) => s.agentRuns.some((r) => r.status === 'running'));
  const isGenerating = isStreaming || hasRunningAgent;
  const { selectedAgentType, setSelectedAgentType } = useAgentStore();
  const { providers, defaultProviderId, selectedModelId, setDefaultProviderId, setSelectedModelId } =
    useSettingsStore();

  const [value, setValue] = useState('');
  const [selectableAgents, setSelectableAgents] = useState<SelectableAgent[]>([]);
  const [enabledModels, setEnabledModels] = useState<ProviderModelConfig[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  React.useImperativeHandle(ref, () => ({
    prefill: (text: string) => {
      setValue(text);
      setTimeout(() => textareaRef.current?.focus(), 50);
    },
  }));

  // Load selectable agents on mount and when window regains focus
  useEffect(() => {
    async function loadSelectableAgents() {
      try {
        const agents = await invoke<SelectableAgent[]>('list_selectable_agents');
        setSelectableAgents(agents);
      } catch (err) {
        console.error('Failed to load selectable agents:', err);
      }
    }
    loadSelectableAgents();

    const handleFocus = () => loadSelectableAgents();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Fallback to orchestrator if selected agent is no longer in the list
  useEffect(() => {
    if (selectableAgents.length > 0 && !selectableAgents.some(a => a.agentType === selectedAgentType)) {
      setSelectedAgentType('orchestrator');
    }
  }, [selectableAgents, selectedAgentType, setSelectedAgentType]);

  // Auto-select provider if only one enabled and none selected
  useEffect(() => {
    const enabled = providers.filter(p => p.isEnabled);
    if (!defaultProviderId && enabled.length > 0) {
      setDefaultProviderId(enabled[0].id);
    }
  }, [providers, defaultProviderId, setDefaultProviderId]);

  // Load enabled models whenever the selected provider changes
  useEffect(() => {
    if (!defaultProviderId) {
      setEnabledModels([]);
      setSelectedModelId(null);
      return;
    }

    invoke<ProviderModelConfig[]>('list_provider_models', { providerId: defaultProviderId })
      .then((models) => {
        const enabled = models.filter((m) => m.enabled);
        if (enabled.length > 0) {
          setEnabledModels(enabled);
          const stillValid = enabled.some((m) => m.modelId === selectedModelId);
          if (!stillValid) {
            setSelectedModelId(enabled[0]?.modelId ?? null);
          }
        } else {
          invoke<string[]>('list_models', { providerId: defaultProviderId })
            .then((allModels) => {
              const asFake = allModels.map((id) => ({ modelId: id, enabled: true, providerId: defaultProviderId!, id: id, maxTokens: 4096, temperature: 0.7, createdAt: '', updatedAt: '' }));
              setEnabledModels(asFake);
              if (!allModels.includes(selectedModelId ?? '')) {
                setSelectedModelId(allModels[0] ?? null);
              }
            })
            .catch(() => {
              const prov = providers.find(p => p.id === defaultProviderId);
              if (prov?.model) {
                setEnabledModels([{ modelId: prov.model, enabled: true, providerId: prov.id, id: prov.model, maxTokens: 4096, temperature: 0.7, createdAt: '', updatedAt: '' }]);
                setSelectedModelId(prov.model);
              }
            });
        }
      })
      .catch(() => {
        setEnabledModels([]);
        setSelectedModelId(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultProviderId]);

  const resize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = '0px';
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isGenerating) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, isGenerating, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = value.trim().length > 0 && !isGenerating;

  return (
    <div className="mx-4 mb-4">
      <div className="max-w-3xl mx-auto w-full">
        {/* Single card container — textarea + footer toolbar */}
        <div
          className={cn(
            'relative flex flex-col rounded-2xl border border-border bg-card shadow-sm',
            'transition-shadow duration-200',
            'focus-within:shadow-md focus-within:border-primary/30'
          )}
        >
          {/* Textarea — grows upward, takes available space */}
          <textarea
            ref={textareaRef}
            data-chat-input="true"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            placeholder="How can I help you today?"
            rows={1}
            className={cn(
              'w-full resize-none bg-transparent border-none outline-none',
              'px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground',
              'custom-scrollbar',
              isGenerating && 'opacity-50 cursor-not-allowed'
            )}
            style={{ minHeight: '44px', maxHeight: `${MAX_HEIGHT}px` }}
          />

          {/* Footer toolbar — flex-shrink-0, stays at bottom */}
          <div className="flex items-center justify-end gap-2 px-3 py-2 flex-shrink-0">
            {/* Agent selector */}
            <Select
              value={selectedAgentType}
              onValueChange={(val: string) => setSelectedAgentType(val as typeof selectedAgentType)}
              disabled={isGenerating}
            >
              <SelectTrigger className="h-7 text-[11px] max-w-[120px]">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent side="top" align="end" sideOffset={4}>
                {selectableAgents.length === 0 ? (
                  <SelectItem value="orchestrator">Orchestrator</SelectItem>
                ) : (
                  selectableAgents.map((agent) => (
                    <SelectItem key={agent.agentType} value={agent.agentType}>
                      {agent.isCustom ? agent.name : (AGENT_LABELS[agent.agentType] || agent.name)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {/* Provider selector */}
            {providers.filter((p) => p.isEnabled).length > 0 && (
              <Select value={defaultProviderId ?? undefined} onValueChange={setDefaultProviderId} disabled={isGenerating}>
                <SelectTrigger className="h-7 text-[11px] max-w-[120px]">
                  <SelectValue placeholder="Provider">
                    {(value) => {
                      const prov = providers.find((p) => p.id === value);
                      return prov?.name ?? value ?? 'Provider';
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent side="top" align="end">
                  {providers.filter((p) => p.isEnabled).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Model selector */}
            {enabledModels.length > 0 && (
              <Select value={selectedModelId ?? undefined} onValueChange={setSelectedModelId} disabled={isGenerating}>
                <SelectTrigger className="h-7 text-[11px] max-w-[160px]">
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent side="top" align="end">
                  {enabledModels.map((m) => (
                    <SelectItem key={m.modelId} value={m.modelId}>{m.modelId}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Stop / Send button */}
            {isGenerating ? (
              <button
                type="button"
                onClick={onStop}
                className={cn(
                  'flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium',
                  'bg-destructive text-destructive-foreground',
                  'hover:bg-destructive/90 active:scale-[0.97] transition-all'
                )}
                title="Stop generating"
              >
                <Icon name="stop-circle" className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className={cn(
                  'flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                  canSend
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97]'
                    : 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
                )}
                title="Send (Enter)"
              >
                <Icon name="arrow-up" className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ChatInputBar.displayName = 'ChatInputBar';
