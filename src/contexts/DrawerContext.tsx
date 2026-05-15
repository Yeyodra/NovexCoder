import React, { createContext, useContext, useCallback, useState, useRef } from 'react';
import { useMotionValue } from 'motion/react';
import type { MotionValue } from 'motion/react';

export interface DrawerContextValue {
  leftDrawerOpen: boolean;
  rightDrawerOpen: boolean;
  openLeftDrawer: () => void;
  closeLeftDrawer: () => void;
  openRightDrawer: () => void;
  closeRightDrawer: () => void;
  toggleLeftDrawer: () => void;
  toggleRightDrawer: () => void;
  leftDrawerX: MotionValue<number>;
  rightDrawerX: MotionValue<number>;
  leftDrawerWidth: React.MutableRefObject<number>;
  rightDrawerWidth: React.MutableRefObject<number>;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export const DrawerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  const leftDrawerX = useMotionValue(-280);
  const rightDrawerX = useMotionValue(320);
  const leftDrawerWidth = useRef(280);
  const rightDrawerWidth = useRef(320);

  const openLeftDrawer = useCallback(() => {
    setLeftDrawerOpen(true);
    leftDrawerX.set(0);
  }, [leftDrawerX]);

  const closeLeftDrawer = useCallback(() => {
    setLeftDrawerOpen(false);
    leftDrawerX.set(-leftDrawerWidth.current);
  }, [leftDrawerX]);

  const openRightDrawer = useCallback(() => {
    setRightDrawerOpen(true);
    rightDrawerX.set(0);
  }, [rightDrawerX]);

  const closeRightDrawer = useCallback(() => {
    setRightDrawerOpen(false);
    rightDrawerX.set(rightDrawerWidth.current);
  }, [rightDrawerX]);

  const toggleLeftDrawer = useCallback(() => {
    if (leftDrawerOpen) {
      closeLeftDrawer();
    } else {
      openLeftDrawer();
    }
  }, [leftDrawerOpen, closeLeftDrawer, openLeftDrawer]);

  const toggleRightDrawer = useCallback(() => {
    if (rightDrawerOpen) {
      closeRightDrawer();
    } else {
      openRightDrawer();
    }
  }, [rightDrawerOpen, closeRightDrawer, openRightDrawer]);

  const value: DrawerContextValue = {
    leftDrawerOpen,
    rightDrawerOpen,
    openLeftDrawer,
    closeLeftDrawer,
    openRightDrawer,
    closeRightDrawer,
    toggleLeftDrawer,
    toggleRightDrawer,
    leftDrawerX,
    rightDrawerX,
    leftDrawerWidth,
    rightDrawerWidth,
  };

  return (
    <DrawerContext.Provider value={value}>
      {children}
    </DrawerContext.Provider>
  );
};

export const useDrawer = (): DrawerContextValue => {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error('useDrawer must be used within a DrawerProvider');
  }
  return context;
};

export const useOptionalDrawer = (): DrawerContextValue | null => useContext(DrawerContext);
