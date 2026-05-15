import React from 'react';
import { cn } from '@/lib/utils';
import { MarkdownCodeBlock } from './MarkdownCodeBlock';

function TableWrapper({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-border/60">
      <table className={cn('w-full border-collapse text-sm', className)}>
        {children}
      </table>
    </div>
  );
}

export const markdownComponents = {
  table({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) {
    return <TableWrapper className={props.className}>{children}</TableWrapper>;
  },
  h1({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h1 {...props} className={cn('mt-4 mb-2 text-[var(--markdown-heading1,var(--primary))] font-semibold text-base', props.className)}>{children}</h1>;
  },
  h2({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h2 {...props} className={cn('mt-3.5 mb-1.5 text-[var(--markdown-heading2,var(--primary))] font-semibold text-base', props.className)}>{children}</h2>;
  },
  h3({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h3 {...props} className={cn('mt-3 mb-1 text-[var(--markdown-heading3,var(--primary))] font-semibold text-[0.9375rem]', props.className)}>{children}</h3>;
  },
  h4({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h4 {...props} className={cn('mt-2.5 mb-1 text-foreground font-semibold text-sm', props.className)}>{children}</h4>;
  },
  h5({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h5 {...props} className={cn('mt-2.5 mb-1 text-foreground font-semibold text-sm', props.className)}>{children}</h5>;
  },
  h6({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h6 {...props} className={cn('mt-2.5 mb-1 text-foreground font-semibold text-sm', props.className)}>{children}</h6>;
  },
  p({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
    return <p {...props} className={cn('my-2 text-foreground/90 text-sm leading-relaxed', props.className)}>{children}</p>;
  },
  thead({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <thead {...props} className={cn('[&_tr]:border-b [&_tr]:border-border/80', props.className)}>{children}</thead>;
  },
  tbody({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
    return <tbody {...props} className={cn('[&_tr:last-child]:border-0 [&_tr]:border-b [&_tr]:border-border/40', props.className)}>{children}</tbody>;
  },
  tr({ children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
    return <tr {...props} className={cn('transition-colors hover:bg-muted/30', props.className)}>{children}</tr>;
  },
  th({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) {
    return <th {...props} className={cn('border-r border-border/60 px-4 py-2 text-left font-semibold text-foreground/80 text-xs uppercase tracking-wider last:border-r-0 bg-muted/30', props.className)}>{children}</th>;
  },
  td({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) {
    return <td {...props} className={cn('border-r border-border/60 px-4 py-2.5 align-middle text-foreground/90 last:border-r-0', props.className)}>{children}</td>;
  },
  ul({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) {
    return <ul {...props} className={cn('my-2 pl-6 list-disc text-sm', props.className)}>{children}</ul>;
  },
  ol({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) {
    return <ol {...props} className={cn('my-2 pl-6 list-decimal text-sm', props.className)}>{children}</ol>;
  },
  li({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) {
    return <li {...props} className={cn('my-0.5 text-foreground/90', props.className)}>{children}</li>;
  },
  blockquote({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) {
    return <blockquote {...props} className={cn('my-3 border-l-2 border-border pl-4 text-muted-foreground text-sm italic', props.className)}>{children}</blockquote>;
  },
  code({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
    const isInline = !className?.includes('language-');
    if (isInline) {
      return (
        <code {...props} className={cn('rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground', className)}>
          {children}
        </code>
      );
    }
    // Code blocks with language class — delegate to MarkdownCodeBlock
    return <MarkdownCodeBlock className={className}>{children}</MarkdownCodeBlock>;
  },
  pre({ children }: { children?: React.ReactNode }) {
    return <>{children}</>;
  },
  a({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return (
      <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary underline decoration-primary/30 hover:decoration-primary transition-colors">
        {children}
      </a>
    );
  },
  hr(props: React.HTMLAttributes<HTMLHRElement>) {
    return <hr {...props} className="my-4 border-border/60" />;
  },
  strong({ children, ...props }: React.HTMLAttributes<HTMLElement>) {
    return <strong {...props} className="font-semibold text-foreground">{children}</strong>;
  },
};
