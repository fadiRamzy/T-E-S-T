import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';

/**
 * موجّه مسارات يعتمد على الـ hash — يعمل على GitHub Pages تحت أي مسار فرعي
 * دون أي إعدادات على الخادم (لا مشاكل 404 عند التحديث).
 */

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function parse(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = cleaned.split('?');
  const rawSegments = pathPart.split('/').filter(Boolean);
  // [merged] this app lives under the #/mgmt/ namespace of the unified portal
  const segments = rawSegments[0] === 'mgmt' ? rawSegments.slice(1) : rawSegments;
  return {
    path: `/${segments.join('/')}`,
    segments,
    query: new URLSearchParams(queryPart ?? ''),
  };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  // [merged] prefix the unified-portal namespace
  const inner = to.startsWith('/') ? to : `/${to}`;
  const target = `#/mgmt${inner === '/' ? '/employees' : inner}`;
  if (options.replace) {
    const url = `${window.location.pathname}${window.location.search}${target}`;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}

export function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '' || value === 'all') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function useNavigate() {
  return useCallback((to: string, options?: { replace?: boolean }) => navigate(to, options), []);
}

/** مكوّن رابط داخلي يحافظ على سلوك المتصفح الصحيح */
export function useLinkProps(to: string) {
  return useMemo(
    () => ({
      href: `#/mgmt${to.startsWith('/') ? to : `/${to}`}`,
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        // التنقل عبر hash يتم تلقائيًا
      },
    }),
    [to],
  );
}
