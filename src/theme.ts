/**
 * Visual theme (light / dark) — Glisse design system.
 * Purely presentational: stores one key in localStorage and sets
 * `data-theme` on <html> (the exact attribute Glisse's styles key off).
 * No application data, records, or business logic are touched.
 */
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'glisse-theme';
const META_COLOR: Record<Theme, string> = { light: '#eef1f6', dark: '#07080c' };
const listeners = new Set<() => void>();

export function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable — theme still applies for this view */
  }
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', META_COLOR[theme]);
  listeners.forEach((l) => l());
}

export function toggleTheme(): void {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

/** Called once at startup (and from the inline script in index.html). */
export function initTheme(): void {
  applyTheme(readStoredTheme() ?? 'light');
}

/** React hook — re-renders subscribers when the theme flips. */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(getTheme);
  useEffect(() => {
    const onChange = () => setTheme(getTheme());
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return theme;
}
