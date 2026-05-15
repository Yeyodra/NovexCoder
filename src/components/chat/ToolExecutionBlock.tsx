import React, { useState } from 'react';
import { ToolCall } from '@/types';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon/Icon';

interface ToolExecutionBlockProps {
  tool: ToolCall;
  defaultExpanded?: boolean;
}

const statusLabel = (status: ToolCall['status']) => {
  if (status === 'failed') return 'failed';
  if (status === 'completed') return 'done';
  if (status === 'running') return 'running';
  return 'queued';
};

export const ToolExecutionBlock: React.FC<ToolExecutionBlockProps> = ({
  tool,
  defaultExpanded = false,
}) => {
  const [open, setOpen] = useState(defaultExpanded);
  const isFailed = tool.status === 'failed';
  const isRunning = tool.status === 'running';
  const isCompleted = tool.status === 'completed';

  return (
    <div className="border-l-2 border-border pl-3 py-1 my-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5 w-full text-left"
      >
        {/* Chevron */}
        <Icon
          name={open ? 'arrow-down-s' : 'arrow-right-s'}
          className="w-3 h-3 shrink-0"
        />

        {/* Tool name */}
        <span className="font-mono text-xs text-muted-foreground">{tool.toolName}</span>

        {/* Status badge */}
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto',
            isFailed && 'bg-destructive/10 text-destructive',
            isRunning && 'bg-primary/10 text-primary',
            isCompleted && 'bg-chart-2/10 text-chart-2',
            !isFailed && !isRunning && !isCompleted && 'bg-muted text-muted-foreground',
          )}
        >
          {isRunning && (
            <Icon name="loader-4" className="w-2.5 h-2.5 inline-block animate-spin mr-0.5 -mt-px" />
          )}
          {statusLabel(tool.status)}
        </span>
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5">
          {/* Input */}
          <div className="text-xs font-mono bg-muted/50 rounded-lg p-2 max-h-40 overflow-auto text-muted-foreground whitespace-pre-wrap break-all">
            {`> ${tool.toolName} ${tool.input}`}
          </div>

          {/* Output */}
          {tool.output && (
            <div className="text-xs font-mono bg-muted/50 rounded-lg p-2 max-h-40 overflow-auto text-muted-foreground whitespace-pre-wrap break-all">
              {tool.output}
            </div>
          )}

          {/* Error */}
          {isFailed && (
            <div className="flex items-start gap-1.5 text-xs bg-destructive/10 text-destructive rounded-lg px-2 py-1.5">
              <Icon name="close" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{tool.error ?? 'Tool execution failed.'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
