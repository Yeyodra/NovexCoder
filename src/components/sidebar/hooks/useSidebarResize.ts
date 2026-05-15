import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'enowx-sidebar-width';
const MIN_WIDTH = 250;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 280;

export function useSidebarResize() {
  const [width, setWidth] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parseInt(stored, 10))) : DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width-left', `${width}px`);
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    setIsResizing(true);
  }, []);

  const onResize = useCallback((e: React.PointerEvent) => {
    if (!isResizing) return;
    const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX));
    setWidth(newWidth);
  }, [isResizing]);

  const stopResize = useCallback((e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.releasePointerCapture(e.pointerId);
    setIsResizing(false);
  }, []);

  return { width, isResizing, startResize, onResize, stopResize };
}
