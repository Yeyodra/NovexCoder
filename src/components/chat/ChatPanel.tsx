import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Sparkle, PencilLine, GraduationCap, Code, Briefcase, Lightning } from '@phosphor-icons/react';
import { useChatStore } from '@/stores/useChatStore';
import { useAgentStore } from '@/stores/useAgentStore';
import { ChatMessage } from './ChatMessage';
import { StreamingMessage } from './StreamingMessage';
import { AgentRunCard } from './AgentRunCard';
import { Message, AgentRunWithTools } from '@/types';
import { cn } from '@/lib/utils';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { Icon } from '@/components/icon/Icon';

interface ChatPanelProps {
  onChipClick?: (text: string) => void;
}

const QUICK_CHIPS = [
  { icon: PencilLine, label: 'Write', prompt: 'Help me write ' },
  { icon: GraduationCap, label: 'Learn', prompt: 'Explain how ' },
  { icon: Code, label: 'Code', prompt: 'Write code to ' },
  { icon: Briefcase, label: 'Personal', prompt: 'Help me with ' },
  { icon: Lightning, label: 'Brainstorm', prompt: 'Brainstorm ideas for ' },
];

const AUTO_FOLLOW_THRESHOLD = 50;

export const ChatPanel: React.FC<ChatPanelProps> = ({ onChipClick }) => {
  const { messages, isStreaming, streamingText } = useChatStore();
  const { agentRuns } = useAgentStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAutoScrolling = useRef(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Check if user is near bottom
  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= AUTO_FOLLOW_THRESHOLD;
  }, []);

  // Smooth scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    isAutoScrolling.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
    // Reset flag after scroll settles
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isAutoScrolling.current = false;
      });
    });
  }, []);

  // Handle scroll events — detect user scroll-up to unpin auto-follow
  const handleScroll = useCallback(() => {
    if (isAutoScrolling.current) return;
    const nearBottom = isNearBottom();
    setShowScrollButton(!nearBottom);
  }, [isNearBottom]);

  // Auto-scroll on new messages when pinned to bottom
  const prevMsgCount = useRef(messages.length);

  useEffect(() => {
    const newMsg = messages.length > prevMsgCount.current;
    prevMsgCount.current = messages.length;

    if (newMsg) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'user') {
        // User just sent — ALWAYS scroll to bottom
        scrollToBottom('smooth');
        setShowScrollButton(false);
      } else if (isNearBottom()) {
        // AI response — only scroll if already near bottom
        scrollToBottom();
      }
    }
  }, [messages.length, messages, scrollToBottom, isNearBottom]);

  // During active streaming, follow new tokens (throttled)
  const streamScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isStreaming || !isNearBottom()) return;
    if (streamScrollTimer.current) return;
    streamScrollTimer.current = setTimeout(() => {
      streamScrollTimer.current = null;
      if (isNearBottom()) scrollToBottom();
    }, 80);
  }, [streamingText, isStreaming, scrollToBottom, isNearBottom]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (streamScrollTimer.current) {
        clearTimeout(streamScrollTimer.current);
      }
    };
  }, []);

  const isEmpty = messages.length === 0 && agentRuns.length === 0 && !isStreaming;

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center pt-[12vh] text-center p-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface-3)] border border-[var(--border)] mb-6 flex items-center justify-center">
          <Sparkle size={26} weight="duotone" className="text-[var(--accent)]" />
        </div>
        <h2 className="text-2xl font-bold mb-2 tracking-tight">Welcome Back!</h2>
        <p className="text-sm text-[var(--text-muted)] mb-8 max-w-sm">
          What would you like to work on today?
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip.label}
              onClick={() => onChipClick?.(chip.prompt)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full',
                'border border-[var(--border)] bg-[var(--surface-2)]/50',
                'text-xs text-[var(--text-muted)] font-medium',
                'hover:bg-[var(--hover-bg-strong)] hover:text-[var(--text)] hover:border-[var(--border-strong)]',
                'transition-all duration-200 active:scale-[0.97]'
              )}
            >
              <chip.icon size={14} weight="duotone" />
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const topLevelRuns = agentRuns.filter((r) => r.parentAgentRunId === null);
  const combinedItems = [
    ...messages.map((m) => ({ type: 'message' as const, data: m, date: new Date(m.createdAt).getTime() })),
    ...topLevelRuns.map((r) => ({ type: 'agent' as const, data: r, date: new Date(r.createdAt).getTime() })),
  ].sort((a, b) => a.date - b.date);

  return (
    <div className="flex-1 relative overflow-hidden min-h-0">
      <ScrollShadow
        ref={scrollRef as React.RefObject<HTMLElement>}
        className="h-full overflow-y-auto custom-scrollbar"
        onScroll={handleScroll}
        style={{ overscrollBehavior: 'contain' }}
      >
        <div className="max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
          {combinedItems.map((item) => {
            if (item.type === 'message') {
              const message = item.data as Message;
              return <ChatMessage key={message.id} message={message} />;
            }
            return <AgentRunCard key={item.data.id} run={item.data as AgentRunWithTools} />;
          })}
          <StreamingMessage />
          <div ref={bottomRef} />
        </div>
      </ScrollShadow>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={() => {
            scrollToBottom('smooth');
            setShowScrollButton(false);
          }}
          className={cn(
            'absolute bottom-4 left-1/2 -translate-x-1/2',
            'w-9 h-9 rounded-full flex items-center justify-center',
            'bg-[var(--surface-2)] border border-[var(--border)]',
            'shadow-lg shadow-black/10',
            'text-[var(--text-muted)] hover:text-[var(--text)]',
            'hover:bg-[var(--surface-3)] hover:border-[var(--border-strong)]',
            'transition-all duration-200',
            'animate-in fade-in slide-in-from-bottom-2 duration-200'
          )}
          aria-label="Scroll to bottom"
        >
          <Icon name="arrow-down-s" className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
