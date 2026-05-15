import { useRef, useState, useEffect, useCallback } from 'react';

export function useStickyHeaders() {
  const [stuckHeaders, setStuckHeaders] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setStuckHeaders((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const projectId = (entry.target as HTMLElement).dataset.projectId;
            if (!projectId) continue;
            if (!entry.isIntersecting) {
              next.add(projectId);
            } else {
              next.delete(projectId);
            }
          }
          return next;
        });
      },
      {
        threshold: [1],
        rootMargin: '-1px 0px 0px 0px',
      }
    );

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  const registerSentinel = useCallback((projectId: string, element: HTMLDivElement | null) => {
    const observer = observerRef.current;
    if (!observer) return;

    // Unobserve previous element for this project
    const prev = sentinelRefs.current.get(projectId);
    if (prev) {
      observer.unobserve(prev);
    }

    if (element) {
      sentinelRefs.current.set(projectId, element);
      observer.observe(element);
    } else {
      sentinelRefs.current.delete(projectId);
    }
  }, []);

  const isStuck = useCallback((projectId: string) => {
    return stuckHeaders.has(projectId);
  }, [stuckHeaders]);

  return { registerSentinel, isStuck };
}
