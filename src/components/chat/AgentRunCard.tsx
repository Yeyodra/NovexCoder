import { useMemo, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { AgentRunWithTools, ToolCall, AGENT_LABELS } from '@/types';
import { useCustomAgentStore } from '@/stores/useCustomAgentStore';
import { ToolExecutionBlock } from './ToolExecutionBlock';
import { ThinkingBlock } from './ThinkingBlock';
import { markdownComponents } from './markdownComponents';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { Icon } from '@/components/icon/Icon';
import { fixMarkdownTables } from '@/lib/utils';

interface AgentRunCardProps {
  run: AgentRunWithTools;
}

type TimelineEventItem =
  | { kind: 'thinking'; key: string; content: string }
  | { kind: 'tool_execution'; key: string; tool: ToolCall }
  | { kind: 'tool_failed'; key: string; tool: ToolCall }
  | { kind: 'result'; key: string; content: string };

/** Format duration between two ISO timestamps into a human-readable string */
const formatDuration = (startedAt?: string, completedAt?: string): string | null => {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = Math.round(secs % 60);
  return `${mins}m ${remainSecs}s`;
};

export function AgentRunCard({ run }: AgentRunCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  const normalizedBlocks = run.thinkingBlocks
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  const liveStream = run.streamingText.trim();

  // Get model name from agent config or default provider
  const { customAgents } = useCustomAgentStore();
  const { agentConfigs } = useAgentStore();
  const { providers, selectedModelId } = useSettingsStore();
  const agentConfig = agentConfigs.find((c) => c.agentType === run.agentType);
  const modelName = agentConfig?.modelId
    ?? selectedModelId
    ?? providers.find((p) => p.isDefault)?.model
    ?? null;

  const duration = formatDuration(run.startedAt, run.completedAt);
  const isRunning = run.status === 'running';
  const isFailed = run.status === 'failed';

  const events = useMemo<TimelineEventItem[]>(() => {
    const list: TimelineEventItem[] = [];

    // Thinking blocks (collapsed, from previous iterations)
    normalizedBlocks.forEach((block, i) => {
      list.push({ kind: 'thinking', key: `${run.id}-thinking-${i}`, content: block });
    });

    // Tool calls
    run.toolCalls.forEach((tool) => {
      if (tool.status === 'failed') {
        list.push({ kind: 'tool_failed', key: `${run.id}-${tool.id}-failed`, tool });
      } else {
        list.push({ kind: 'tool_execution', key: `${run.id}-${tool.id}-exec`, tool });
      }
    });

    // Live streaming text — show as result (markdown rendered) while generating
    if (run.status === 'running' && liveStream.length > 0) {
      list.push({ kind: 'result', key: `${run.id}-streaming`, content: liveStream });
    }

    // Final output
    if (run.status === 'completed' && run.output) {
      list.push({ kind: 'result', key: `${run.id}-result`, content: run.output });
    }

    if (run.status === 'failed' && run.error) {
      list.push({ kind: 'result', key: `${run.id}-result-failed`, content: run.error });
    }

    return list;
  }, [
    run.id,
    run.output,
    run.error,
    run.status,
    run.toolCalls,
    normalizedBlocks,
    liveStream,
  ]);

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = run.output ?? run.error ?? '';
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [run.output, run.error]);

  const agentLabel = AGENT_LABELS[run.agentType] || customAgents.find(a => a.agentType === run.agentType)?.name || run.agentType;

  const toolEvents = events.filter((e) => e.kind !== 'result');
  const resultEvents = events.filter((e) => e.kind === 'result');

  return (
    <div className="space-y-3">
      {/* Agent card — collapsible, contains only tools + thinking */}
      <div className="border rounded-xl bg-card/50 overflow-hidden">
        {/* Header — click to collapse/expand */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 border-b border-border/50 w-full text-left hover:bg-muted/30 transition-colors"
        >
          {/* Status indicator */}
          {isRunning ? (
            <Icon name="loader-4" className="w-3.5 h-3.5 text-primary animate-spin" />
          ) : isFailed ? (
            <Icon name="close" className="w-3.5 h-3.5 text-destructive" />
          ) : (
            <Icon name="check" className="w-3.5 h-3.5 text-chart-2" />
          )}

          {/* Agent type badge */}
          <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
            {agentLabel}
          </span>

          {/* Model + duration on the right */}
          <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            {modelName && <span>{modelName}</span>}
            {duration && (
              <>
                <span className="text-border">·</span>
                <span>{duration}</span>
              </>
            )}
          </div>

          {/* Chevron */}
          <Icon
            name={collapsed ? 'arrow-right-s' : 'arrow-down-s'}
            className="w-3.5 h-3.5 text-muted-foreground"
          />
        </button>

        {/* Collapsible body — only tool calls and thinking blocks */}
        {!collapsed && toolEvents.length > 0 && (
          <div className="px-3 py-2 space-y-2">
            {toolEvents.map((event) => {
              if (event.kind === 'thinking') {
                return <ThinkingBlock key={event.key} content={event.content} defaultCollapsed={true} />;
              }

              if (event.kind === 'tool_execution') {
                return <ToolExecutionBlock key={event.key} tool={event.tool} defaultExpanded={false} />;
              }

              // tool_failed
              return <ToolExecutionBlock key={event.key} tool={event.tool} defaultExpanded={true} />;
            })}
          </div>
        )}
      </div>

      {/* Output text — OUTSIDE the card, flows as regular content */}
      {resultEvents.length > 0 && (
        <div className="space-y-3">
          {resultEvents.map((event) => {
            const isLiveStreaming = isRunning && event.key.endsWith('-streaming');
            return (
              <div key={event.key} className="text-sm leading-relaxed text-foreground">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={markdownComponents}
                >
                  {fixMarkdownTables(event.content)}
                </ReactMarkdown>
                {isLiveStreaming && (
                  <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle animate-pulse rounded-full" />
                )}
              </div>
            );
          })}

          {/* Copy button — below output text */}
          {!isRunning && (run.output || run.error) && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => void handleCopy()}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                title="Copy response"
              >
                {copied ? (
                  <Icon name="check" className="w-3 h-3 text-chart-2" />
                ) : (
                  <Icon name="clipboard" className="w-3 h-3" />
                )}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
