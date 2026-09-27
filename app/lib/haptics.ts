/**
 * A light tick under the finger, for taps that change something (switching
 * tabs in the dock). Android browsers have the Vibration API; call this
 * straight from the click handler, since it only works while handling a tap.
 * Safari on iOS has no such API: there the tick comes from `HapticSwitch`.
 */
export function tapHaptic() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Haptics are a nicety; never let them break the tap.
  }
}
