/**
 * A light tick under the finger, for taps that change something (switching
 * tabs in the dock). Does nothing where the phone offers no way to do it.
 *
 * Android browsers have the Vibration API. Safari on iOS doesn't, but since
 * iOS 18 it gives a tick when a switch (`<input type="checkbox" switch>`) is
 * toggled from a tap, so on iOS we toggle a hidden one. Both only work while
 * handling a tap, so call this straight from the click handler.
 */
export function tapHaptic() {
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
      return;
    }
    let label = document.createElement("label");
    label.ariaHidden = "true";
    label.style.display = "none";
    let input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.append(input);
    document.head.append(label);
    label.click();
    label.remove();
  } catch {
    // Haptics are a nicety; never let them break the tap.
  }
}
