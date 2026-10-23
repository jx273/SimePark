/**
 * Minimal hash-based router.
 *
 * Why not react-router: the app has seven routes, no nested layouts, and no data
 * loaders. A dependency would add ~10 kB and a second source of routing truth
 * for no capability we need.
 *
 * Why hash rather than the History API: Cloudflare Pages serves the SPA from a
 * single `index.html`, and a deep link such as `/property/demo-001` would need a
 * rewrite rule or a `_redirects` file to avoid a hard 404 on refresh. Hash
 * routing works on any static host with no server configuration, which keeps
 * deployment simpler and the guest experience reliable.
 *
 * Routes are parsed and built by the same pair of functions, so a link produced
 * by `routeToPath` always parses back to the same route. `src/router/__tests__`
 * asserts that round trip.
 */

import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'property'; id: string }
  | { name: 'dashboard' }
  | { name: 'admin' }
  | { name: 'auth'; mode: AuthMode }
  | { name: 'privacy' }
  | { name: 'notFound'; path: string };

export type AuthMode = 'signin' | 'signup' | 'reset' | 'callback';

/** Parse a location hash (with or without the leading '#') into a Route. */
export function parseRoute(hash: string): Route {
  const clean = (hash.startsWith('#') ? hash.slice(1) : hash).trim();
  const path = clean.startsWith('/') ? clean : `/${clean}`;
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) return { name: 'home' };

  const [first, second] = segments;

  if (first === 'property' && second) {
    return { name: 'property', id: decodeURIComponent(second) };
  }
  if (first === 'dashboard') return { name: 'dashboard' };
  if (first === 'admin') return { name: 'admin' };
  if (first === 'privacy') return { name: 'privacy' };
  if (first === 'auth') {
    const mode: AuthMode =
      second === 'signup' || second === 'reset' || second === 'callback'
        ? second
        : 'signin';
    return { name: 'auth', mode };
  }

  return { name: 'notFound', path };
}

/** Build the hash for a route. Always round-trips through parseRoute. */
export function routeToPath(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'property':
      return `#/property/${encodeURIComponent(route.id)}`;
    case 'dashboard':
      return '#/dashboard';
    case 'admin':
      return '#/admin';
    case 'privacy':
      return '#/privacy';
    case 'auth':
      return `#/auth/${route.mode}`;
    case 'notFound':
      return `#${route.path}`;
  }
}

/** Navigate programmatically; pushes a history entry. */
export function navigate(route: Route | string): void {
  if (typeof window === 'undefined') return;
  const path = typeof route === 'string' ? route : routeToPath(route);
  window.location.hash = path;
}

/** Replace the current entry, for redirects that should not be undoable. */
export function redirect(route: Route | string): void {
  if (typeof window === 'undefined') return;
  const path = typeof route === 'string' ? route : routeToPath(route);
  const url = `${window.location.pathname}${window.location.search}${path}`;
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function currentHash(): string {
  if (typeof window === 'undefined') return '#/';
  if (window.location.hash) return window.location.hash;
  if (window.location.pathname && window.location.pathname !== '/') {
    return `#${window.location.pathname.replace(/\/$/, '')}`;
  }
  return '#/';
}

/**
 * Subscribe to the current route.
 *
 * Re-renders on `hashchange`, which covers in-app navigation, the browser's back
 * and forward buttons, and externally set hashes (used by redirect()).
 */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(currentHash()));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(currentHash()));
    window.addEventListener('hashchange', onChange);
    // Convert direct path navigation or Cloudflare/Supabase auth callback paths
    // into hash routes while preserving query parameters.
    if (!window.location.hash) {
      const initialHash = currentHash();
      const basePath =
        window.location.pathname && window.location.pathname !== '/'
          ? '/'
          : window.location.pathname;
      window.history.replaceState(
        null,
        '',
        `${basePath}${window.location.search}${initialHash}`
      );
    }
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

/** Imperative navigation helper for components. */
export function useNavigate(): (route: Route | string) => void {
  return useCallback((route: Route | string) => navigate(route), []);
}

/**
 * Scroll to the top on route change.
 *
 * Without this, navigating from a scrolled section on the home page to a detail
 * page leaves the user mid-document. Skipped when the user prefers reduced
 * motion, and it never blocks the render.
 */
export function useScrollToTopOnRouteChange(route: Route, enabled = true): void {
  const key = routeToPath(route);
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    if (route.name === 'home') {
      try {
        const savedY = sessionStorage.getItem('simepark_explorer_scroll_y');
        if (savedY !== null) {
          sessionStorage.removeItem('simepark_explorer_scroll_y');
          const y = parseFloat(savedY);
          if (!isNaN(y)) {
            // Allow DOM to settle before restoring scroll position
            setTimeout(() => {
              window.scrollTo({ top: y, behavior: 'auto' });
            }, 50);
            return;
          }
        }
      } catch {
        // safe fallback
      }
    }

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: prefersReduced ? 'auto' : 'smooth' });
  }, [key, enabled, route.name]);
}
