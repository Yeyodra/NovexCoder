import React from 'react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { SessionSidebar } from '@/components/sidebar/SessionSidebar';

const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 500;

export function LeftSidebar() {
  const isOpen = useUIStore((s) => s.leftSidebarOpen);

  const [width, setWidth] = React.useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  const sidebarRef = React.useRef<HTMLElement | null>(null);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(width);
  const resizingWidthRef = React.useRef<number | null>(null);
  const activePointerIdRef = React.useRef<number | null>(null);

  // Track mobile breakpoint
  React.useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Cancel resize if mobile
  React.useEffect(() => {
    if (isMobile && isResizing) {
      setIsResizing(false);
    }
  }, [isMobile, isResizing]);

  // Cleanup refs on resize end
  React.useEffect(() => {
    if (!isResizing) {
      resizingWidthRef.current = null;
      activePointerIdRef.current = null;
    }
  }, [isResizing]);

  const clamp = React.useCallback((value: number) => {
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value));
  }, []);

  const applyLiveWidth = React.useCallback((nextWidth: number) => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    sidebar.style.setProperty('--oc-left-sidebar-width', `${nextWidth}px`);
  }, []);

  if (isMobile) {
    return null;
  }

  const appliedWidth = isOpen ? clamp(width) : 0;

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!isOpen) return;

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

    const delta = event.clientX - startXRef.current;
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

  return (
    <aside
      ref={sidebarRef}
      className={cn(
        'relative flex h-full overflow-hidden',
        isResizing ? 'transition-none' : 'transition-[width] duration-300 ease-in-out',
        !isOpen && 'border-r-0'
      )}
      style={{
        width: 'var(--oc-left-sidebar-width)',
        minWidth: 'var(--oc-left-sidebar-width)',
        maxWidth: 'var(--oc-left-sidebar-width)',
        ['--oc-left-sidebar-width' as string]: `${isResizing ? (resizingWidthRef.current ?? appliedWidth) : appliedWidth}px`,
        overflowX: 'clip',
      }}
      aria-hidden={!isOpen || appliedWidth === 0}
    >
      {/* Resize handle */}
      {isOpen && (
        <div
          className={cn(
            'absolute right-0 top-0 z-20 h-full w-[3px] cursor-col-resize hover:bg-border/80 transition-colors',
            isResizing && 'bg-border'
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />
      )}

      {/* Sidebar content */}
      <div
        className={cn(
          'relative z-10 flex h-full flex-col overflow-hidden',
          isResizing && 'pointer-events-none',
          !isOpen && 'pointer-events-none select-none opacity-0'
        )}
        style={{ width: 'var(--oc-left-sidebar-width)', overflowX: 'hidden' }}
        aria-hidden={!isOpen}
      >
        <div className="flex-1 overflow-y-auto">
          <SessionSidebar />
        </div>
      </div>
    </aside>
  );
}
