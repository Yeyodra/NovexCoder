import { useState, useEffect } from 'react';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  deviceType: DeviceType;
  hasTouchInput: boolean;
}

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

function detectHasTouch(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  const noHover = window.matchMedia?.('(hover: none)')?.matches ?? false;
  const maxTouch = navigator.maxTouchPoints ?? 0;
  return coarse || noHover || maxTouch > 0;
}

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return { isMobile: false, isTablet: false, isDesktop: true, deviceType: 'desktop', hasTouchInput: false };
  }

  const width = window.innerWidth;
  const hasTouchInput = detectHasTouch();

  const isMobile = width <= MOBILE_BREAKPOINT || (hasTouchInput && width <= MOBILE_BREAKPOINT);
  const isTablet = !isMobile && width > MOBILE_BREAKPOINT && width <= TABLET_BREAKPOINT;
  const isDesktop = width > TABLET_BREAKPOINT;

  let deviceType: DeviceType = 'desktop';
  if (isMobile) deviceType = 'mobile';
  else if (isTablet) deviceType = 'tablet';

  return { isMobile, isTablet, isDesktop, deviceType, hasTouchInput };
}

export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  return width <= MOBILE_BREAKPOINT || detectHasTouch();
}

export function isTablet(): boolean {
  if (typeof window === 'undefined') return false;
  const width = window.innerWidth;
  return width > MOBILE_BREAKPOINT && width <= TABLET_BREAKPOINT;
}

export function isDesktop(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth > TABLET_BREAKPOINT;
}

export function useDevice(): DeviceInfo {
  const [device, setDevice] = useState<DeviceInfo>(getDeviceInfo);

  useEffect(() => {
    const update = () => setDevice(getDeviceInfo());

    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return device;
}
