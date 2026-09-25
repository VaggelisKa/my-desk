import { useEffect, useLayoutEffect, useRef, useState } from "react";

// A soft spring: quick, with a small overshoot at the end.
export let SLIDE =
  "transition-[transform,width,height] duration-500 [transition-timing-function:cubic-bezier(0.34,1.36,0.64,1)] motion-reduce:transition-none";

export type HighlightPosition = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Tracks where the active item sits so one highlight can slide between items
 * instead of each item drawing its own. Used by the masthead tabs, the dock
 * and the desks page day strip.
 */
export function useSlidingHighlight<Key>(active: Key | null | undefined) {
  let items = useRef(new Map<Key, HTMLElement>());
  let [position, setPosition] = useState<HighlightPosition | null>(null);
  let [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    // A hidden item (the masthead on phones, the dock on desktop) measures as
    // zero, and layouts change with the width, so measure again on resize.
    function measure() {
      let item = active != null ? items.current.get(active) : undefined;
      setPosition(
        item?.offsetWidth
          ? {
              left: item.offsetLeft,
              top: item.offsetTop,
              width: item.offsetWidth,
              height: item.offsetHeight,
            }
          : null,
      );
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  // The first placement should not slide in from the left edge.
  useEffect(() => {
    if (position && !animate) {
      requestAnimationFrame(() => setAnimate(true));
    }
  }, [position, animate]);

  function itemRef(key: Key) {
    return (node: HTMLElement | null) => {
      if (node) {
        items.current.set(key, node);
      } else {
        items.current.delete(key);
      }
    };
  }

  return { position, animate, itemRef };
}
