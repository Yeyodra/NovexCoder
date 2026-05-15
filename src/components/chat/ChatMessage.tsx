import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/utils';
import { Message } from '@/types';
import { markdownComponents } from './markdownComponents';
import { fixMarkdownTables } from '@/lib/utils';
import { Icon } from '@/components/icon/Icon';
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

export const ChatMessage = React.memo<ChatMessageProps>(({ message }) => {
  const isUser = message.role === 'user';

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
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={markdownComponents}
          >
            {fixMarkdownTables(content)}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});

ChatMessage.displayName = 'ChatMessage';
