import React from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon/Icon';

// TODO: Replace with actual git status from Tauri backend
// Commands needed: git_status, git_stage, git_unstage, git_commit
// These don't exist yet — implement in src-tauri/src/commands/

interface GitFileEntry {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | 'U';
}

// Placeholder data — remove when backend is connected
const MOCK_STAGED: GitFileEntry[] = [];
const MOCK_UNSTAGED: GitFileEntry[] = [];

const STATUS_COLORS: Record<GitFileEntry['status'], string> = {
  A: 'text-green-400',
  M: 'text-yellow-400',
  D: 'text-red-400',
  R: 'text-blue-400',
  U: 'text-orange-400',
};

const STATUS_LABELS: Record<GitFileEntry['status'], string> = {
  A: 'Added',
  M: 'Modified',
  D: 'Deleted',
  R: 'Renamed',
  U: 'Untracked',
};

function FileEntry({ file }: { file: GitFileEntry }) {
  const filename = file.path.split('/').pop() ?? file.path;
  const directory = file.path.includes('/')
    ? file.path.slice(0, file.path.lastIndexOf('/'))
    : '';

  return (
    <div className="group flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/50 cursor-pointer text-sm">
      <Icon name="file-code" className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate font-mono text-xs text-foreground">{filename}</span>
      {directory && (
        <span className="truncate text-xs text-muted-foreground ml-auto">{directory}</span>
      )}
      <span
        className={cn(
          'ml-auto shrink-0 text-xs font-semibold',
          STATUS_COLORS[file.status]
        )}
        title={STATUS_LABELS[file.status]}
      >
        {file.status}
      </span>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-foreground uppercase tracking-wide">
          {title}
        </span>
        {count > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

export function GitView() {
  const [commitMessage, setCommitMessage] = React.useState('');
  const [staged] = React.useState<GitFileEntry[]>(MOCK_STAGED);
  const [unstaged] = React.useState<GitFileEntry[]>(MOCK_UNSTAGED);

  // TODO: Fetch git status from backend on mount and on refresh
  const handleRefresh = () => {
    // TODO: invoke('git_status') and update staged/unstaged
  };

  // TODO: Stage all unstaged files
  const handleStageAll = () => {
    // TODO: invoke('git_stage', { paths: unstaged.map(f => f.path) })
  };

  // TODO: Commit staged changes
  const handleCommit = () => {
    if (!commitMessage.trim() || staged.length === 0) return;
    // TODO: invoke('git_commit', { message: commitMessage })
    setCommitMessage('');
  };

  const canCommit = commitMessage.trim().length > 0 && staged.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium text-foreground">Source Control</span>
        <button
          onClick={handleRefresh}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <Icon name="loop-left" className="size-4" />
        </button>
      </div>

      {/* Scrollable file lists */}
      <div className="flex-1 overflow-y-auto">
        {/* Staged Changes */}
        <div className="py-1">
          <SectionHeader title="Staged Changes" count={staged.length} />
          {staged.length > 0 ? (
            <div className="px-1">
              {staged.map((file) => (
                <FileEntry key={file.path} file={file} />
              ))}
            </div>
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground italic">
              No staged changes
            </p>
          )}
        </div>

        {/* Unstaged Changes */}
        <div className="py-1">
          <SectionHeader
            title="Changes"
            count={unstaged.length}
            action={
              unstaged.length > 0 ? (
                <button
                  onClick={handleStageAll}
                  className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Stage All"
                >
                  <Icon name="add" className="size-3.5" />
                </button>
              ) : undefined
            }
          />
          {unstaged.length > 0 ? (
            <div className="px-1">
              {unstaged.map((file) => (
                <FileEntry key={file.path} file={file} />
              ))}
            </div>
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground italic">
              No changes
            </p>
          )}
        </div>
      </div>

      {/* Commit section */}
      <div className="border-t border-border p-3 space-y-2">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message..."
          rows={3}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={handleCommit}
          disabled={!canCommit}
          className={cn(
            'w-full rounded-lg py-1.5 text-sm font-medium transition-colors',
            canCommit
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Icon name="git-commit" className="size-4" />
            Commit
          </span>
        </button>
      </div>
    </div>
  );
}
