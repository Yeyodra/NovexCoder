import React from 'react';
import { Sparkle } from '@phosphor-icons/react';
import { useChatStore } from '@/stores/useChatStore';
import { BusyDots } from './BusyDots';

export const StreamingMessage: React.FC = () => {
  const { streamingText, isStreaming } = useChatStore();

  if (!isStreaming) return null;

  return (
    <div className="flex gap-3 w-full">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center shrink-0 mt-0.5">
        <Sparkle size={14} weight="fill" className="text-[var(--accent-fg)]" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-0.5 text-[15px] leading-relaxed text-[var(--text)]">
        {streamingText ? (
          <>
            <span className="whitespace-pre-wrap">{streamingText}</span>
            <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle animate-pulse rounded-full" />
          </>
        ) : (
          <BusyDots />
        )}
      </div>
    </div>
  );
};
