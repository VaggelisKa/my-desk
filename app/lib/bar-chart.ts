// The sums behind the Metrics bar chart: the value axis, where each bar
// goes, which date labels fit and which bar is under the pointer.

/** The drawing area inside the chart, in pixels from its top left. */
export type Plot = { left: number; top: number; width: number; height: number };

/**
 * Five evenly spaced whole numbers from 0 whose last one covers `max`: the
 * step is 1, 2, 2.5, 5 and so on times a power of ten, like 0, 70, 140, 210,
 * 280 for 270.
 */
export function valueTicks(max: number) {
  if (!Number.isFinite(max) || !(max > 0)) {
    return [0, 1, 2, 3, 4];
  }

  // The smallest such step at least a quarter of `max`, grown until four
  // steps reach it. Counted in whole units so no rounding error creeps in.
  let quarter = max / 4;
  let digits = quarter < 1 ? 0 : String(Math.floor(quarter)).length;
  let stepOf = (units: number) =>
    digits === 1 ? units : Math.ceil((units * 10 ** digits) / 20);
  let units = Math.ceil(digits === 1 ? quarter : (quarter * 20) / 10 ** digits);
  let step = stepOf(units);

  while (step * 4 < max) {
    step = stepOf(++units);
  }

  return [0, step, step * 2, step * 3, step * 4];
}

/** Bar `index` of `count`: 80% of its slot, centred in it. */
export function barAt(plot: Plot, count: number, index: number) {
  let slot = count ? plot.width / count : 0;
  let width = slot * 0.8 > 1 ? Math.floor(slot * 0.8) : slot * 0.8;
  return { slot, x: plot.left + slot * index + (slot - width) / 2, width };
}

/** The bar whose slot the pointer is over, or null outside the bars. */
export function barIndexAt(plot: Plot, count: number, x: number, y: number) {
  let inside =
    x >= plot.left &&
    x <= plot.left + plot.width &&
    y >= plot.top &&
    y <= plot.top + plot.height;
  if (!inside || count === 0 || plot.width <= 0) {
    return null;
  }
  return Math.min(
    count - 1,
    Math.floor(((x - plot.left) / plot.width) * count),
  );
}

/**
 * Where each date label goes, or null for the ones left out so they don't
 * overlap. The first and last always show, pulled inside the chart's edges;
 * between them each one shows if it keeps `gap` clear of its neighbours.
 */
export function visibleLabels(
  centers: number[],
  widths: number[],
  start: number,
  end: number,
  gap: number,
) {
  let last = centers.length - 1;
  if (last < 0) {
    return [];
  }
  let at: (number | null)[] = centers.map(() => null);
  let inside = (i: number) =>
    Math.max(start + widths[i] / 2, Math.min(centers[i], end - widths[i] / 2));

  at[last] = inside(last);
  if (last === 0) {
    return at;
  }
  let lastLeft = at[last]! - widths[last] / 2;

  // The first gives way only when the last leaves it no room at all, which
  // takes a chart narrower than two labels.
  let first = inside(0);
  if (first + widths[0] / 2 + gap > lastLeft) {
    return at;
  }
  at[0] = first;

  let from = first + widths[0] / 2 + gap;
  for (let i = 1; i < last; i++) {
    let left = centers[i] - widths[i] / 2;
    let right = centers[i] + widths[i] / 2;
    if (left >= from && right + gap <= lastLeft) {
      at[i] = centers[i];
      from = right + gap;
    }
  }

  return at;
}
