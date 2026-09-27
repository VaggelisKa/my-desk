// Keeps keyboard and screen reader users in place when the control they were
// on goes away: a row removed straight away, a sheet moving to its next step,
// a button that turns disabled while it saves. Left alone, focus falls back to
// the page body and they would have to start again from the top.

/**
 * Once the page has settled, focuses `home` if focus was lost, or the page's
 * heading when `home` is gone too. Does nothing if focus is somewhere already.
 */
export function rescueFocus(home?: HTMLElement | null) {
  requestAnimationFrame(() => {
    let active = document.activeElement;
    if (active && active !== document.body) return;

    let target = home?.isConnected
      ? home
      : document.querySelector<HTMLElement>("main h1");
    if (!target) return;
    if (!target.matches("a[href], button, input, select, textarea")) {
      target.tabIndex = -1;
    }
    target.focus();
  });
}

/**
 * Before `row` is removed, moves focus to the same control (found by
 * `selector`) on the next row, or the previous one for the last row. Falls
 * back to `rescueFocus(home)` when it was the only one. When `home` holds the
 * row, only rows inside it count. Only acts when focus is inside `row`, so
 * taps on a phone never move anything.
 */
export function focusNeighbour(
  row: HTMLElement,
  selector: string,
  home?: HTMLElement | null,
) {
  if (!row.contains(document.activeElement)) return;
  let from = row.matches(selector)
    ? row
    : row.querySelector<HTMLElement>(selector);

  // Phones and desktop can both be in the page with CSS hiding one.
  let scope = home?.contains(row) ? home : document;
  let visible = [...scope.querySelectorAll<HTMLElement>(selector)].filter(
    (element) => element === from || element.getClientRects().length > 0,
  );
  let at = from ? visible.indexOf(from) : -1;
  let next = at < 0 ? undefined : (visible[at + 1] ?? visible[at - 1]);

  if (next) {
    next.focus();
  } else {
    (document.activeElement as HTMLElement | null)?.blur();
    rescueFocus(home);
  }
}
