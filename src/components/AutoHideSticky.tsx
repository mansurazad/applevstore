import { ReactNode, CSSProperties } from "react";

interface AutoHideStickyProps {
  hidden: boolean;
  headerHeight: number;
  headerRef: React.RefObject<HTMLDivElement>;
  className?: string;
  children: ReactNode;
  /** z-index for the sticky header; default 20 */
  zIndex?: number;
}

/**
 * Wrapper that makes a sticky header auto-hide WITHOUT leaving blank space.
 *
 * Trick: keep the header `sticky top-0` so it occupies layout normally when
 * visible. When `hidden` is true, we translate it off-screen AND apply a
 * negative margin-bottom equal to its height so the next content slides up
 * to fill the gap. The transition animates both for a smooth effect.
 */
export function AutoHideSticky({
  hidden,
  headerHeight,
  headerRef,
  className = "",
  children,
  zIndex = 20,
}: AutoHideStickyProps) {
  const style: CSSProperties = {
    transform: hidden ? `translateY(-${headerHeight}px)` : "translateY(0)",
    marginBottom: hidden ? `-${headerHeight}px` : 0,
    transition: "transform 300ms ease, margin-bottom 300ms ease",
    zIndex,
  };

  return (
    <div
      ref={headerRef}
      style={style}
      className={`sticky top-0 bg-background/85 backdrop-blur-xl border-b border-border/50 ${className}`}
    >
      {children}
    </div>
  );
}
