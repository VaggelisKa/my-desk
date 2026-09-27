/**
 * An invisible switch laid over a tap target, for a haptic tick on iPhones.
 * Safari on iOS 18 and later ticks when a finger toggles a switch
 * (`<input type="checkbox" switch>`), but since iOS 26.5 not when code
 * toggles one, so the finger has to land on the switch itself. The click
 * still bubbles to the element underneath, which handles the tap as usual.
 * Place it inside a positioned element; elsewhere it is an unstyled checkbox
 * nobody sees.
 */
export function HapticSwitch() {
  return (
    <input
      type="checkbox"
      {...{ switch: "" }}
      aria-hidden
      tabIndex={-1}
      className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
    />
  );
}
