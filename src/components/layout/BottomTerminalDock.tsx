import React from 'react';
import { cn } from '@/lib/utils';
import { useLayoutStore } from '@/stores/useLayoutStore';

const PANEL_MIN_HEIGHT = 180;
const PANEL_MAX_HEIGHT = 640;
const COLLAPSE_THRESHOLD = 110;

interface BottomTerminalDockProps {
  children: React.ReactNode;
}

export function BottomTerminalDock({ children }: BottomTerminalDockProps) {
  const bottomPanelOpen = useLayoutStore((s) => s.bottomPanelOpen);
  const bottomPanelHeight = useLayoutStore((s) => s.bottomPanelHeight);
  const bottomPanelFullscreen = useLayoutStore((s) => s.bottomPanelFullscreen);
  const setBottomPanelHeight = useLayoutStore((s) => s.setBottomPanelHeight);
  const toggleBottomPanel = useLayoutStore((s) => s.toggleBottomPanel);

  const [isResizing, setIsResizing] = React.useState(false);

  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const startYRef = React.useRef(0);
  const startHeightRef = React.useRef(bottomPanelHeight);
  const resizingHeightRef = React.useRef<number | null>(null);
  const activePointerIdRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!isResizing) {
      resizingHeightRef.current = null;
      activePointerIdRef.current = null;
    }
  }, [isResizing]);

  const clamp = React.useCallback((value: number) => {
    return Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, value));
  }, []);

  const applyLiveHeight = React.useCallback((nextHeight: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.setProperty('--dock-height', `${nextHeight}px`);
  }, []);

  const handlePointerDown = (event: React.PointerEvent) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    activePointerIdRef.current = event.pointerId;
    setIsResizing(true);
    startYRef.current = event.clientY;
    startHeightRef.current = bottomPanelHeight;
    resizingHeightRef.current = bottomPanelHeight;
    applyLiveHeight(bottomPanelHeight);
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isResizing || activePointerIdRef.current !== event.pointerId) return;

    // Dragging up increases height, dragging down decreases
    const delta = startYRef.current - event.clientY;
    const rawHeight = startHeightRef.current + delta;

    // Check collapse threshold before clamping
    if (rawHeight < COLLAPSE_THRESHOLD) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      activePointerIdRef.current = null;
      resizingHeightRef.current = null;
      setIsResizing(false);
      toggleBottomPanel();
      return;
    }

    const nextHeight = clamp(rawHeight);
    if (resizingHeightRef.current === nextHeight) return;

    resizingHeightRef.current = nextHeight;
    applyLiveHeight(nextHeight);
  };

  const handlePointerEnd = (event: React.PointerEvent) => {
    if (activePointerIdRef.current !== event.pointerId) return;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    const finalHeight = clamp(resizingHeightRef.current ?? bottomPanelHeight);
    activePointerIdRef.current = null;
    resizingHeightRef.current = null;
    setIsResizing(false);
    setBottomPanelHeight(finalHeight);
  };

  const isOpen = bottomPanelOpen;
  const appliedHeight = clamp(bottomPanelHeight);

  return (
    <div
      ref={panelRef}
      className={cn(
        'relative flex flex-col overflow-hidden border-t border-border bg-sidebar',
        isResizing ? 'transition-none' : 'transition-[height] duration-200 ease-out',
        !isOpen && 'h-0 !min-h-0 !max-h-0 border-t-0'
      )}
      style={isOpen ? {
        height: bottomPanelFullscreen ? 'calc(100vh - 48px)' : 'var(--dock-height)',
        minHeight: bottomPanelFullscreen ? 'calc(100vh - 48px)' : 'var(--dock-height)',
        maxHeight: bottomPanelFullscreen ? 'calc(100vh - 48px)' : 'var(--dock-height)',
        ['--dock-height' as string]: `${isResizing ? (resizingHeightRef.current ?? appliedHeight) : appliedHeight}px`,
      } : {
        height: '0px',
        minHeight: '0px',
        maxHeight: '0px',
      }}
    >
      {/* Drag handle — only show when open and not fullscreen */}
      {isOpen && !bottomPanelFullscreen && (
        <div
          className={cn(
            'absolute left-0 right-0 top-0 z-20 h-1 cursor-ns-resize transition-colors',
            'hover:bg-ring',
            isResizing && 'bg-ring'
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal panel"
        />
      )}

      {/* Panel content — always rendered to keep terminal alive */}
      <div
        className={cn(
          'relative z-10 flex flex-1 flex-col overflow-hidden',
          isResizing && 'pointer-events-none select-none'
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default BottomTerminalDock;
