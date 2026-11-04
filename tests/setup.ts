/**
 * jsdom polyfills for browser APIs that Glisse's components touch
 * (matchMedia / ResizeObserver). Test-environment only — the app itself
 * never requires them.
 */
if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  const w = window as unknown as Record<string, unknown>;
  if (typeof w.ResizeObserver !== 'function') {
    w.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof w.IntersectionObserver !== 'function') {
    w.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
}
