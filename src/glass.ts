/**
 * Pointer-following rim light for glass surfaces — the same technique as
 * Glisse's `.lg-glass::after` (a radial highlight at `--lg-x` / `--lg-y`),
 * driven here by delegated pointermove so no component markup changes.
 */
const GLASS_TARGETS = [
  '.lg-glass',
  '.app-sidebar',
  '.app-topbar',
  '.sidebar',
  '.picker__pop',
  '.modal',
  '.drawer',
  '.toast',
  '.toastx',
  '.site-switch',
  '.portal-btn',
  '.portal-card',
  '.emp-filter-btn',
  '.tabs',
  '.card',
  '.tablewrap',
  '.leave-filter-panel',
  '.stat',
  '.iconbtn',
].join(',');

export function initGlassLens(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.(GLASS_TARGETS) as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      el.style.setProperty('--lg-x', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
      el.style.setProperty('--lg-y', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    },
    { passive: true },
  );
}
