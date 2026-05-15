import React from 'react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { GitView } from '@/components/views/GitView';

const SIDEBAR_DEFAULT_WIDTH = 420;
const SIDEBAR_MIN_WIDTH = 400;
const SIDEBAR_MAX_WIDTH = 860;

type Tab = 'Git' | 'Files' | 'Context';

export function RightSidebar() {
  const isOpen = useUIStore((s) => s.rightSidebarOpen);

  const [width, setWidth] = React.useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<Tab>('Git');
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
    sidebar.style.setProperty('--oc-right-sidebar-width', `${nextWidth}px`);
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

    // Inverted: moving left = wider for right sidebar
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

  const tabs: Tab[] = ['Git', 'Files', 'Context'];

  return (
    <aside
      ref={sidebarRef}
      className={cn(
        'relative flex h-full overflow-hidden',
        isResizing ? 'transition-none' : 'transition-[width] duration-300 ease-in-out',
        !isOpen && 'border-l-0'
      )}
      style={{
        width: 'var(--oc-right-sidebar-width)',
        minWidth: 'var(--oc-right-sidebar-width)',
        maxWidth: 'var(--oc-right-sidebar-width)',
        ['--oc-right-sidebar-width' as string]: `${isResizing ? (resizingWidthRef.current ?? appliedWidth) : appliedWidth}px`,
        overflowX: 'clip',
      }}
      aria-hidden={!isOpen || appliedWidth === 0}
    >
      {/* Resize handle — LEFT edge */}
      {isOpen && (
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
          aria-label="Resize right sidebar"
        />
      )}

      {/* Sidebar content */}
      <div
        className={cn(
          'relative z-10 flex h-full w-full flex-col overflow-hidden',
          isResizing && 'pointer-events-none',
          !isOpen && 'pointer-events-none select-none opacity-0'
        )}
        aria-hidden={!isOpen}
      >
        {/* Tab strip */}
        <div className="flex items-center border-b border-border px-2 h-10 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={cn(
                'relative px-3 py-1.5 text-sm rounded-md transition-colors',
                activeTab === tab
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'Git' && <GitView />}
          {activeTab !== 'Git' && (
            <div className="flex items-center justify-center h-full p-4 text-muted-foreground text-sm">
              {activeTab} — coming soon
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
