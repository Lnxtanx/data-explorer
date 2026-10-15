import { useEffect, useState } from 'react';

/**
 * Shared media-query hook. Returns whether the viewport currently matches
 * `query`, updating on resize/orientation changes.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mql = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Matches the same 768px line used by the app's `md:` breakpoint. */
export const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

/**
 * True on phone-sized viewports. Kept in sync with the Tailwind `md:`
 * breakpoint so JS-driven layout toggles line up with CSS ones.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}
