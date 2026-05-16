import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon/Icon';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { TerminalViewport } from './TerminalViewport';
import { ShellPicker } from './ShellPicker';
import type { ShellInfo } from '@/types/shell';

export function TerminalView() {
  const { tabs, activeTabId, createTab, setActiveTab, setTabSessionId, setTabLifecycle } =
    useTerminalStore();
  const isFullscreen = useLayoutStore((s) => s.bottomPanelFullscreen);

  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [defaultShellId, setDefaultShellId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      invoke<ShellInfo[]>('get_available_shells'),
      invoke<string | null>('get_default_shell'),
    ]).then(([shellsResult, defaultId]) => {
      setShells(shellsResult);
      if (defaultId && shellsResult.some((s) => s.id === defaultId)) {
        setDefaultShellId(defaultId);
      } else if (shellsResult.length > 0) {
        setDefaultShellId(shellsResult[0].id);
      }
    }).catch(console.error);
  }, []);

  const handleCreateTab = useCallback((shell?: ShellInfo) => {
    const tabId = createTab(shell);
    // Delay terminal session creation to let TerminalViewport mount and register event listeners
    setTimeout(async () => {
      // Read fresh project path from store (not from stale closure)
      const { projects, activeProjectId } = useProjectStore.getState();
      const project = projects.find((p) => p.id === activeProjectId);
      const cwd = project?.path || null;
      try {
        const sessionId = await invoke<string>('create_terminal', {
          cwd,
          cols: 80,
          rows: 24,
          shell: shell?.path || null,
          shellId: shell?.id || null,
        });
        setTabSessionId(tabId, sessionId);
        setTabLifecycle(tabId, 'running');
      } catch (err) {
        console.error('Failed to create terminal:', err);
        setTabLifecycle(tabId, 'exited');
      }
    }, 50);
  }, [createTab, setTabSessionId, setTabLifecycle]);

  const handleCreateDefault = useCallback(() => {
    const defaultShell = shells.find((s) => s.id === defaultShellId) || shells[0];
    handleCreateTab(defaultShell);
  }, [shells, defaultShellId, handleCreateTab]);

  const handleSelectShell = useCallback((shell: ShellInfo) => {
    handleCreateTab(shell);
  }, [handleCreateTab]);

  const handleSetDefault = useCallback((shell: ShellInfo) => {
    setDefaultShellId(shell.id);
    invoke('set_default_shell', { shellId: shell.id }).catch(console.error);
  }, []);

  const bottomPanelOpen = useLayoutStore((s) => s.bottomPanelOpen);

  // Auto-create first tab when dock opens (by then projects are loaded)
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (hasInitializedRef.current) return;
    if (!bottomPanelOpen) return;
    if (tabs.length === 0) {
      hasInitializedRef.current = true;
      handleCreateTab();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomPanelOpen]);

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      const currentTabs = useTerminalStore.getState().tabs;
      const tab = currentTabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        try {
          await invoke('kill_terminal', { sessionId: tab.sessionId });
        } catch {
          // Terminal may already be dead
        }
      }
      useTerminalStore.getState().closeTab(tabId);
    },
    [],
  );

  const handleData = useCallback(
    (tabId: string) => (data: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        const encoder = new TextEncoder();
        const bytes = Array.from(encoder.encode(data));
        invoke('write_terminal', { sessionId: tab.sessionId, data: bytes }).catch(console.error);
      }
    },
    [tabs],
  );

  const handleResize = useCallback(
    (tabId: string) => (cols: number, rows: number) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.sessionId) {
        invoke('resize_terminal', { sessionId: tab.sessionId, cols, rows }).catch(console.error);
      }
    },
    [tabs],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-border bg-sidebar px-2">
        {/* Left: tabs */}
        <div className="flex items-center gap-0.5 overflow-x-auto py-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={cn(
                'group relative flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                tab.id === activeTabId
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {/* Terminal icon */}
              <Icon name="terminal-box" className="h-3.5 w-3.5 shrink-0" />
              {/* Label */}
              <span className="truncate max-w-[100px]">{tab.label}</span>
              {/* Close button — visible on hover or when active */}
              <span
                className={cn(
                  'ml-0.5 flex h-4 w-4 items-center justify-center rounded-sm transition-opacity',
                  'hover:bg-foreground/10',
                  tab.id === activeTabId
                    ? 'opacity-60 hover:opacity-100'
                    : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
              >
                <Icon name="close" className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
        {/* Right: controls */}
        <div className="flex items-center gap-0.5 ml-auto pl-2">
          <ShellPicker
            shells={shells}
            defaultShellId={defaultShellId}
            onCreateDefault={handleCreateDefault}
            onSelectShell={handleSelectShell}
            onSetDefault={handleSetDefault}
          />
          {/* Fullscreen toggle */}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={() => useLayoutStore.getState().toggleBottomPanelFullscreen()}
            title={isFullscreen ? "Restore terminal" : "Maximize terminal"}
          >
            <Icon name={isFullscreen ? "fullscreen-exit" : "fullscreen"} className="h-3.5 w-3.5" />
          </button>
          {/* Close dock */}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={() => useLayoutStore.getState().toggleBottomPanel()}
            title="Close terminal"
          >
            <Icon name="arrow-down-s" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal viewports — render ALL, hide inactive to preserve state */}
      <div className="flex-1 overflow-hidden relative">
        {tabs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No terminal open
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                'absolute inset-0',
                tab.id === activeTabId ? 'z-10 visible' : 'z-0 invisible'
              )}
            >
              <TerminalViewport
                sessionId={tab.sessionId}
                onData={handleData(tab.id)}
                onResize={handleResize(tab.id)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
