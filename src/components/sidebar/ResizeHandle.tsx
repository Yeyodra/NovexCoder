import { useSidebarResize } from './hooks/useSidebarResize';

interface ResizeHandleProps {
  resize: ReturnType<typeof useSidebarResize>;
}

export function ResizeHandle({ resize }: ResizeHandleProps) {
  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-[var(--primary)] hover:opacity-50 transition-opacity"
      onPointerDown={resize.startResize}
      onPointerMove={resize.onResize}
      onPointerUp={resize.stopResize}
      style={{ opacity: resize.isResizing ? 0.5 : undefined, background: resize.isResizing ? 'var(--primary)' : undefined }}
    />
  );
}
