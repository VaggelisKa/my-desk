import { useSyncExternalStore } from "react";

/**
 * An invisible switch laid over a tap target, for a haptic tick on iPhones.
 * Safari on iOS 18 and later ticks when a finger toggles a switch
 * (`<input type="checkbox" switch>`), but since iOS 26.5 not when code
 * toggles one, so the finger has to land on the switch itself. The click
 * still bubbles to the element underneath, which handles the tap as usual.
 * Place it inside a positioned element.
 *
 * The switch takes the tap, so the link underneath can't act on its own. It
 * only appears once the app has hydrated, so a tap before that still follows
 * the link, and only for touch, so a mouse keeps middle and modifier clicks.
 */
export function HapticSwitch() {
  let hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  if (!hydrated) return null;
  return (
    <input
      type="checkbox"
      {...{ switch: "" }}
      aria-hidden
      tabIndex={-1}
      className="absolute inset-0 m-0 hidden size-full cursor-pointer opacity-0 [@media(pointer:coarse)]:block"
    />
  );
}

function subscribeToNothing() {
  return () => {};
}
