import React from 'react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import type { ContextPanelMode } from '@/stores/useUIStore';

const PANEL_DEFAULT_WIDTH = 480;
const PANEL_MIN_WIDTH = 360;
const PANEL_MAX_WIDTH = 1400;

export function ContextPanel() {
  const isOpen = useUIStore((s) => s.contextPanelOpen);
  const activeMode = useUIStore((s) => s.contextPanelMode);
  const setMode = useUIStore((s) => s.setContextPanelMode);
  const togglePanel = useUIStore((s) => s.toggleContextPanel);

  const [width, setWidth] = React.useState(PANEL_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = React.useState(false);

  const panelRef = React.useRef<HTMLElement | null>(null);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(width);
  const resizingWidthRef = React.useRef<number | null>(null);
  const activePointerIdRef = React.useRef<number | null>(null);

  // Cleanup refs on resize end
  React.useEffect(() => {
    if (!isResizing) {
      resizingWidthRef.current = null;
      activePointerIdRef.current = null;
    }
  }, [isResizing]);

  const clamp = React.useCallback((value: number) => {
    return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, value));
  }, []);

  const applyLiveWidth = React.useCallback((nextWidth: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.setProperty('--context-panel-width', `${nextWidth}px`);
  }, []);

  if (!isOpen) return null;

  const appliedWidth = clamp(width);

  const handlePointerDown = (event: React.PointerEvent) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    activePointerIdRef.current = event.pointerId;
    setIsResizing(true);
    startXRef.current = event.clientX;
    startWidthRef.current = appliedWidth;
    resizingWidthRef.current = appliedWidth;
    applyLiveWidth(appliedWidth);
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isResizing || activePointerIdRef.current !== event.pointerId) return;

    // Moving left = wider for context panel (resize handle on left edge)
    const delta = startXRef.current - event.clientX;
    const nextWidth = clamp(startWidthRef.current + delta);
    if (resizingWidthRef.current === nextWidth) return;

    resizingWidthRef.current = nextWidth;
    applyLiveWidth(nextWidth);
  };

  const handlePointerEnd = (event: React.PointerEvent) => {
    if (activePointerIdRef.current !== event.pointerId) return;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    const finalWidth = clamp(resizingWidthRef.current ?? appliedWidth);
    activePointerIdRef.current = null;
    resizingWidthRef.current = null;
    setIsResizing(false);
    setWidth(finalWidth);
  };

  const tabs: { id: ContextPanelMode; label: string }[] = [
    { id: 'diff', label: 'Diff' },
    { id: 'file', label: 'File' },
    { id: 'preview', label: 'Preview' },
  ];

  return (
    <aside
      ref={panelRef}
      className={cn(
        'relative flex h-full flex-col overflow-hidden border-l border-border bg-background',
        isResizing ? 'transition-none' : 'transition-[width] duration-300 ease-in-out'
      )}
      style={{
        width: 'var(--context-panel-width)',
        minWidth: 'var(--context-panel-width)',
        maxWidth: 'var(--context-panel-width)',
        ['--context-panel-width' as string]: `${isResizing ? (resizingWidthRef.current ?? appliedWidth) : appliedWidth}px`,
        overflowX: 'clip',
      }}
    >
      {/* Resize handle — LEFT edge */}
      <div
        className={cn(
          'absolute left-0 top-0 z-20 h-full w-[3px] cursor-col-resize hover:bg-border/80 transition-colors',
          isResizing && 'bg-border'
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize context panel"
      />

      {/* Panel content */}
      <div
        className={cn(
          'relative z-10 flex h-full w-full flex-col overflow-hidden',
          isResizing && 'pointer-events-none'
        )}
      >
        {/* Tab strip */}
        <div className="flex items-center gap-1 px-2 h-10 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={cn(
                'relative px-3 py-1.5 text-sm rounded-md transition-colors',
                activeMode === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setMode(tab.id)}
            >
              {tab.label}
              {activeMode === tab.id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Close button */}
          <button
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={togglePanel}
            aria-label="Close context panel"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeMode === 'diff' && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select a file to view diff
            </div>
          )}
          {activeMode === 'file' && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select a file to view
            </div>
          )}
          {activeMode === 'preview' && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
                HTML preview
              </div>
              <iframe
                title="Preview"
                className="w-full flex-1 border-none"
                sandbox="allow-scripts"
                srcDoc=""
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
