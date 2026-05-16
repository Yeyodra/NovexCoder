import type { Message } from '@/types';

export interface ChildSessionExport {
  title: string;
  messages: Message[];
  children: ChildSessionExport[];
}

export function formatTimestamp(createdAt: string): string {
  const date = new Date(createdAt);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month} ${day}, ${year}, ${hours}:${minutes}`;
}

export function formatMessageAsMarkdown(message: Message): string {
  const roleLabel =
    message.role === 'user'
      ? 'User'
      : message.role === 'assistant'
        ? 'Assistant'
        : 'System';
  const timestamp = formatTimestamp(message.createdAt);
  return `**${roleLabel}**\n\n*${timestamp}*\n\n${message.content}`;
}

export function formatChildSessionAsMarkdown(
  child: ChildSessionExport,
  depth: number,
): string {
  const headingPrefix = '#'.repeat(depth + 1);
  const title = child.title?.trim() || 'Sub-session';
  const header = `${headingPrefix} Sub-session: ${title}\n\n---\n\n`;
  const body = child.messages
    .map(formatMessageAsMarkdown)
    .filter(Boolean)
    .join('\n\n---\n\n');

  let result = header + body;

  if (child.children && child.children.length > 0) {
    const childMarkdown = child.children
      .map((c) => formatChildSessionAsMarkdown(c, depth + 1))
      .join('\n\n---\n\n');
    result += '\n\n---\n\n' + childMarkdown;
  }

  return result;
}

export function formatSessionAsMarkdown(
  messages: Message[],
  sessionTitle?: string,
  childSessions?: ChildSessionExport[],
): string {
  const title = sessionTitle?.trim() || 'Session';
  const date = new Date().toISOString().split('T')[0];
  const header = `# ${title}\n\n*Exported on ${date}*\n\n---\n\n`;
  const body = messages
    .map(formatMessageAsMarkdown)
    .filter(Boolean)
    .join('\n\n---\n\n');

  let result = header + body;

  if (childSessions && childSessions.length > 0) {
    const childMarkdown = childSessions
      .map((child) => formatChildSessionAsMarkdown(child, 1))
      .join('\n\n---\n\n');
    result += '\n\n---\n\n' + childMarkdown;
  }

  return result;
}

export function buildExportFilename(sessionTitle?: string): string {
  const base = sessionTitle?.trim() || 'session';
  const safe = base
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const normalizedBase = safe || 'session';
  const date = new Date().toISOString().split('T')[0];
  return `${normalizedBase}-${date}.md`;
}
