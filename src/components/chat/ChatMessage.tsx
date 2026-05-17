import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/utils';
import { Message, ChatToolCall } from '@/types';
import { markdownComponents } from './markdownComponents';
import { fixMarkdownTables } from '@/lib/utils';
import { Icon } from '@/components/icon/Icon';
import { useChatStore } from '@/stores/useChatStore';
import 'highlight.js/styles/github-dark.css';

/**
 * Strip XML-style segment tags (<thinking>, <tool>, <response>) and
 * heading-based segment markers so we render a single clean markdown block.
 */
const cleanContent = (raw: string): string => {
  let text = raw.replace(/\r\n/g, '\n').trim();

  // Remove XML segment wrappers — keep inner content
  text = text.replace(/<\/?(?:thinking|tool|response)>/gi, '');

  // Remove heading lines that are purely segment labels
  text = text.replace(
    /^#{1,6}\s+(?:thinking|reasoning|analysis|chain of thought|tool execution?|response|final answer|answer)\s*$/gim,
    '',
  );

  // Remove prefix-style segment labels  (e.g. "Response: ...")
  text = text.replace(
    /^(?:thinking|reasoning|analysis|tool|executing tool|response|final answer)\s*[:\-]\s*/gim,
    '',
  );

  // Collapse 3+ consecutive blank lines into 2
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
};

interface ChatMessageProps {
  message: Message;
}

/* ── ChatToolCallBlock ──────────────────────────────────── */

const ChatToolCallBlock: React.FC<{ toolCall: ChatToolCall }> = ({ toolCall }) => {
  const [open, setOpen] = useState(false);
  const isRunning = toolCall.status === 'running' || toolCall.status === 'pending';
  const isError = toolCall.status === 'error' || toolCall.isError;
  const isCompleted = toolCall.status === 'completed';

  return (
    <div className="border-l-2 border-border pl-3 py-1 my-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-0.5 w-full text-left"
      >
        <Icon
          name={open ? 'arrow-down-s' : 'arrow-right-s'}
          className="w-3 h-3 shrink-0"
        />
        <span className="font-mono text-xs text-muted-foreground">{toolCall.toolName}</span>
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto',
            isError && 'bg-destructive/10 text-destructive',
            isRunning && 'bg-primary/10 text-primary',
            isCompleted && 'bg-chart-2/10 text-chart-2',
            !isError && !isRunning && !isCompleted && 'bg-muted text-muted-foreground',
          )}
        >
          {isRunning && (
            <Icon name="loader-4" className="w-2.5 h-2.5 inline-block animate-spin mr-0.5 -mt-px" />
          )}
          {isError ? 'failed' : isRunning ? 'running' : 'done'}
        </span>
        {toolCall.durationMs && (
          <span className="text-[10px] text-muted-foreground">{toolCall.durationMs}ms</span>
        )}
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5">
          {toolCall.toolInput && (
            <pre className="text-[11px] font-mono bg-muted/50 rounded-lg p-2 max-h-40 overflow-auto text-muted-foreground whitespace-pre-wrap break-all">
              {toolCall.toolInput}
            </pre>
          )}
          {toolCall.toolOutput && (
            <pre
              className={cn(
                'text-[11px] font-mono rounded-lg p-2 max-h-60 overflow-auto whitespace-pre-wrap break-all',
                isError ? 'bg-destructive/5 text-destructive' : 'bg-muted/50 text-foreground',
              )}
            >
              {toolCall.toolOutput}
            </pre>
          )}
          {isError && !toolCall.toolOutput && (
            <div className="flex items-start gap-1.5 text-xs bg-destructive/10 text-destructive rounded-lg px-2 py-1.5">
              <Icon name="close" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Tool execution failed.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── ChatMessage ───────────────────────────────────────────── */

export const ChatMessage = React.memo<ChatMessageProps>(({ message }) => {
  const isUser = message.role === 'user';
  const toolCalls = useChatStore((state) => state.toolCalls[message.id]) ?? [];

  /* ── User bubble ─────────────────────────────────────────── */
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            'rounded-3xl rounded-br-lg bg-card px-4 py-2.5',
            'max-w-[85%]',
          )}
        >
          <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  /* ── Assistant message ────────────────────────────────────── */
  const content = cleanContent(message.content);

  return (
    <div className="flex gap-3 items-start">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-lg bg-card border border-border flex items-center justify-center flex-shrink-0">
        <Icon name="sparkling" className="h-3.5 w-3.5 text-primary" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 space-y-2">
        {/* Tool calls rendered before text */}
        {toolCalls.length > 0 && (
          <div className="space-y-1">
            {toolCalls.map((tc) => (
              <ChatToolCallBlock key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Text content */}
        {content && (
          <div className="text-sm leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={markdownComponents}
            >
              {fixMarkdownTables(content)}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
});

ChatMessage.displayName = 'ChatMessage';
