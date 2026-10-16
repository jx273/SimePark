/**
 * Interaction hooks: scroll reveal and animated figures.
 *
 * Both respect `prefers-reduced-motion`, and neither delays access to
 * information: a revealed element that never intersects is still readable
 * because the CSS class only offsets it slightly, and an animating figure shows
 * its final value immediately when motion is reduced.
 */

import { useEffect, useRef, useState } from 'react';
import { systemPrefersReducedMotion } from '../theme/ThemeProvider';

/**
 * Add `is-visible` to an element once it enters the viewport.
 *
 * Uses IntersectionObserver, so there is no scroll listener and no layout
 * thrash. Elements are revealed once and then unobserved.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: { threshold?: number; rootMargin?: string } = {}
) {
  const ref = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Without IntersectionObserver, or with reduced motion, show immediately.
    if (typeof IntersectionObserver === 'undefined' || systemPrefersReducedMotion()) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      {
        threshold: options.threshold ?? 0.12,
        rootMargin: options.rootMargin ?? '0px 0px -8% 0px',
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [options.threshold, options.rootMargin]);

  const className = `reveal${isVisible ? ' is-visible' : ''}`;
  return { ref, isVisible, className };
}

/**
 * Animate a number towards a target value.
 *
 * Returns the target immediately when motion is reduced or when the value barely
 * changed, so a recalculation never looks like a malfunction.
 */
export function useAnimatedNumber(target: number, durationMs = 700): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const delta = target - from;

    // No animation needed or wanted for a negligible change.
    if (
      systemPrefersReducedMotion() ||
      !Number.isFinite(target) ||
      !Number.isFinite(from) ||
      Math.abs(delta) < 1
    ) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const start = performance.now();

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      // Ease out cubic: quick start, gentle settle.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + delta * eased);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
        setDisplay(target);
      }
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = target;
    };
  }, [target, durationMs]);

  return display;
}

/**
 * True once the window has scrolled past `offset`.
 *
 * Used by the header to tighten on scroll. Uses a passive listener and rAF
 * throttling so it cannot block scrolling on a low-end phone.
 */
export function useScrolled(offset = 24): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let ticking = false;

    const update = () => {
      ticking = false;
      setScrolled(window.scrollY > offset);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [offset]);

  return scrolled;
}
