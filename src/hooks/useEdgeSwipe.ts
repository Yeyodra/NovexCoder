import { useEffect, useRef } from 'react';
import { useOptionalDrawer } from '@/contexts/DrawerContext';

interface EdgeSwipeOptions {
  edgeThreshold?: number;
  minSwipeDistance?: number;
  maxSwipeTime?: number;
  enabled?: boolean;
}

export function useEdgeSwipe(options: EdgeSwipeOptions = {}) {
  const {
    edgeThreshold = 20,
    minSwipeDistance = 50,
    maxSwipeTime = 300,
    enabled = true,
  } = options;

  const drawer = useOptionalDrawer();
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    if (!enabled || !drawer) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) {
        touchStartRef.current = null;
        return;
      }

      const screenWidth = window.innerWidth;
      const fromLeft = touch.clientX <= edgeThreshold;
      const fromRight = touch.clientX >= screenWidth - edgeThreshold;

      if (fromLeft || fromRight) {
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
        };
      } else {
        touchStartRef.current = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
      if (deltaX > 10) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const touch = e.changedTouches[0];
      if (!touch) {
        touchStartRef.current = null;
        touchEndRef.current = null;
        return;
      }

      touchEndRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };

      const { x: startX, y: startY, time: startTime } = touchStartRef.current;
      const { x: endX, y: endY, time: endTime } = touchEndRef.current;

      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const deltaTime = endTime - startTime;

      const isHorizontal = Math.abs(deltaY) < Math.abs(deltaX);
      const isQuick = deltaTime <= maxSwipeTime;
      const limitedVertical = Math.abs(deltaY) < minSwipeDistance;

      const screenWidth = window.innerWidth;
      const startedFromLeft = startX <= edgeThreshold;
      const startedFromRight = startX >= screenWidth - edgeThreshold;

      // Left edge swipe → open left drawer
      const isValidLeftSwipe =
        startedFromLeft &&
        deltaX >= minSwipeDistance &&
        isHorizontal &&
        isQuick &&
        limitedVertical;

      // Right edge swipe → open right drawer
      const isValidRightSwipe =
        startedFromRight &&
        deltaX <= -minSwipeDistance &&
        isHorizontal &&
        isQuick &&
        limitedVertical;

      if (isValidLeftSwipe && !drawer.leftDrawerOpen) {
        drawer.openLeftDrawer();
      }

      if (isValidRightSwipe && !drawer.rightDrawerOpen) {
        drawer.openRightDrawer();
      }

      touchStartRef.current = null;
      touchEndRef.current = null;
    };

    const handleTouchCancel = () => {
      touchStartRef.current = null;
      touchEndRef.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true, capture: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('touchmove', handleTouchMove, { capture: true });
      document.removeEventListener('touchend', handleTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', handleTouchCancel, { capture: true });
    };
  }, [
    enabled,
    drawer,
    edgeThreshold,
    minSwipeDistance,
    maxSwipeTime,
  ]);
}
