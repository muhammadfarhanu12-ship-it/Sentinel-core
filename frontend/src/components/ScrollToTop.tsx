import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

type ScrollToTopProps = {
  /**
   * Optional selector for a custom scroll container (e.g. <main className="overflow-y-auto" />).
   * If omitted, defaults to `#app-scroll-container`, then falls back to `[data-scroll-container]`.
   */
  containerSelector?: string;
};

/**
 * Global, lightweight scroll reset on route changes.
 *
 * Why this exists:
 * - React Router doesn't reset scroll position by default.
 * - This app uses a custom scroll container (`<main className="overflow-y-auto" />`), so we reset both:
 *   - the window (for public pages)
 *   - the app scroll container (for authenticated pages under /app)
 */
export function ScrollToTop({ containerSelector }: ScrollToTopProps) {
  const { pathname } = useLocation();

  useEffect(() => {
    // Use rAF to ensure the next route has rendered before we touch scroll containers.
    requestAnimationFrame(() => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch {
        window.scrollTo(0, 0);
      }

      const selector = containerSelector || '#app-scroll-container';
      const container =
        (document.querySelector(selector) as HTMLElement | null) ||
        (document.querySelector('[data-scroll-container]') as HTMLElement | null);

      if (container) {
        if (typeof (container as any).scrollTo === 'function') {
          (container as any).scrollTo({ top: 0, left: 0, behavior: 'auto' });
        } else {
          container.scrollTop = 0;
          container.scrollLeft = 0;
        }
      }
    });
  }, [pathname, containerSelector]);

  return null;
}

