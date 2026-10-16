import { describe, it, expect } from 'vitest';
import { parseRoute, routeToPath, type Route } from '../router';

/**
 * The router builds links with `routeToPath` and reads them with `parseRoute`.
 * If those two ever disagree, a link silently lands on the wrong page, so the
 * round trip is the most important property to pin down.
 */
describe('route round trip', () => {
  const routes: Route[] = [
    { name: 'home' },
    { name: 'dashboard' },
    { name: 'admin' },
    { name: 'privacy' },
    { name: 'property', id: 'demo-001' },
    { name: 'auth', mode: 'signin' },
    { name: 'auth', mode: 'signup' },
    { name: 'auth', mode: 'reset' },
    { name: 'auth', mode: 'callback' },
    { name: 'notFound', path: '/nope' },
  ];

  it.each(routes.map((route) => [JSON.stringify(route), route] as const))(
    'parses %s back to itself',
    (_label, route) => {
      expect(parseRoute(routeToPath(route))).toEqual(route);
    }
  );
});

describe('parseRoute', () => {
  it('treats an empty or root hash as home', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('/')).toEqual({ name: 'home' });
  });

  it('reads a property id, including encoded characters', () => {
    expect(parseRoute('#/property/demo-007')).toEqual({ name: 'property', id: 'demo-007' });
    expect(parseRoute('#/property/a%20b')).toEqual({ name: 'property', id: 'a b' });
  });

  it('treats a property route without an id as not found rather than home', () => {
    // Landing on "home" would silently hide a broken link.
    expect(parseRoute('#/property')).toEqual({ name: 'notFound', path: '/property' });
  });

  it('defaults an unknown auth mode to sign in', () => {
    expect(parseRoute('#/auth')).toEqual({ name: 'auth', mode: 'signin' });
    expect(parseRoute('#/auth/whatever')).toEqual({ name: 'auth', mode: 'signin' });
  });

  it('reports unknown paths as not found with the original path', () => {
    expect(parseRoute('#/totally/unknown')).toEqual({
      name: 'notFound',
      path: '/totally/unknown',
    });
  });

  it('tolerates a missing leading slash', () => {
    expect(parseRoute('#dashboard')).toEqual({ name: 'dashboard' });
  });
});
