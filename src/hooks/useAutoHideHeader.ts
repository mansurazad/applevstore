import { useEffect, useRef, useState } from "react";

/**
 * Auto-hide a sticky header on scroll-down, reveal on scroll-up.
 * - `containerRef`: attach to the scrollable container (falls back to window).
 * - `headerRef`: attach to the sticky header element. We measure its height
 *   so callers can collapse the reserved space when hidden (no blank gap).
 * - `hidden`: true when the header should be translated off-screen.
 * - `headerHeight`: live measured height of the header (px). Use this to
 *   set a top padding/spacer that animates to 0 when `hidden` is true.
 */
export function useAutoHideHeader<
  C extends HTMLElement = HTMLDivElement,
  H extends HTMLElement = HTMLDivElement
>(threshold = 8) {
  const containerRef = useRef<C | null>(null);
  const headerRef = useRef<H | null>(null);
  const lastScrollY = useRef(0);
  const [hidden, setHidden] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Track header height (responsive, content changes, etc.)
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const target: HTMLElement | Window = containerRef.current ?? window;

    const getY = () =>
      target instanceof Window ? window.scrollY : (target as HTMLElement).scrollTop;

    lastScrollY.current = getY();

    const onScroll = () => {
      const currentY = getY();
      const diff = currentY - lastScrollY.current;

      if (currentY < 24) {
        setHidden(false);
      } else if (diff > threshold) {
        setHidden(true);
        lastScrollY.current = currentY;
      } else if (diff < -threshold) {
        setHidden(false);
        lastScrollY.current = currentY;
      }
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return { containerRef, headerRef, hidden, headerHeight };
}
