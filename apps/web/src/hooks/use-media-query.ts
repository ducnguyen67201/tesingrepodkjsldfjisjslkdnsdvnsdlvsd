import { useState, useEffect } from "react";

/**
 * Hook to detect if a media query matches.
 * Returns true when the media query matches, false otherwise.
 *
 * @param query - The media query to match (e.g., "(min-width: 768px)")
 * @returns Whether the media query matches
 *
 * @example
 * ```tsx
 * const isDesktop = useMediaQuery("(min-width: 768px)");
 *
 * return isDesktop ? <DesktopNav /> : <MobileNav />;
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);

    // Set initial value
    setMatches(mediaQuery.matches);

    // Create event listener
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add listener
    mediaQuery.addEventListener("change", handleChange);

    // Cleanup
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [query]);

  return matches;
}
