import type { ITheme } from 'xterm';

/**
 * Reads a CSS custom property from :root.
 * Returns the raw value or empty string if not set.
 */
function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Converts an oklch() CSS string to a hex color.
 * Handles the format: oklch(L C H) where L is 0-1, C is chroma, H is hue degrees.
 * Falls back to the provided default if parsing fails.
 */
function oklchToHex(oklchStr: string, fallback: string): string {
  if (!oklchStr || !oklchStr.startsWith('oklch(')) return fallback;

  // Use a temporary element to let the browser resolve the color
  const el = document.createElement('div');
  el.style.color = oklchStr;
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  document.body.removeChild(el);

  // computed is typically "rgb(r, g, b)" or "rgba(r, g, b, a)"
  const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return fallback;

  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Resolves a CSS variable to a hex color usable by xterm.js.
 * Handles oklch() values by converting them via the browser's color engine.
 */
function resolveColor(varName: string, fallback: string): string {
  const raw = getCssVar(varName);
  if (!raw) return fallback;
  if (raw.startsWith('#')) return raw;
  if (raw.startsWith('oklch(')) return oklchToHex(raw, fallback);
  // For rgb/hsl or other formats, use the temp-element trick
  return oklchToHex(raw, fallback) !== fallback ? oklchToHex(raw, fallback) : fallback;
}

/**
 * Builds an xterm.js theme that matches the app's design system.
 *
 * The terminal sits inside BottomTerminalDock which uses bg-sidebar.
 * We use the same variable so the terminal blends seamlessly.
 */
export function getTerminalTheme(): ITheme {
  const bg = resolveColor('--sidebar', '#1c1917');
  const fg = resolveColor('--foreground', '#e7e5e4');
  const accent = resolveColor('--primary', '#c9a033');

  return {
    background: bg,
    foreground: fg,
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: resolveColor('--accent', '#44403c'),
    selectionForeground: fg,
    // ANSI colors — balanced for readability on dark backgrounds
    black: bg,
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#eab308',
    blue: '#3b82f6',
    magenta: '#a855f7',
    cyan: '#06b6d4',
    white: '#e7e5e4',
    brightBlack: '#57534e',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: '#60a5fa',
    brightMagenta: '#c084fc',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff',
  };
}
