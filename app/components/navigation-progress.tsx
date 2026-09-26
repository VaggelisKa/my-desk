import { useEffect, useState } from "react";
import { useNavigation } from "react-router";
import { cn } from "~/lib/utils";

/**
 * Thin progress bar at the top of the viewport while a client-side
 * navigation is in flight. Streaming SSR only helps the first document
 * load; this covers the in-app transitions.
 */
export function NavigationProgress() {
  let navigation = useNavigation();
  let isNavigating = navigation.state !== "idle";
  let [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isNavigating) {
      setVisible(true);
      return;
    }

    // Keep the bar around briefly so the completion animation can play.
    let timeout = setTimeout(() => setVisible(false), 300);
    return () => clearTimeout(timeout);
  }, [isNavigating]);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-valuetext={isNavigating ? "Loading" : "Done"}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className={cn(
          "h-full bg-primary transition-[width,opacity] ease-out",
          isNavigating
            ? "duration-[3000ms] w-[85%] opacity-100"
            : "w-full opacity-0 duration-300",
        )}
      />
    </div>
  );
}
