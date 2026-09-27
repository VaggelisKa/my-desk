// The chart's box, shared by the chart and the empty frame shown while the
// chart library loads, so the page does not jump when it arrives. The
// recharts selectors tone the library's greys down to the app's.
export let CHART_FRAME =
  "flex h-[240px] justify-center text-xs sm:h-[300px] [&_.recharts-cartesian-axis-tick_text]:fill-ink-muted [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-line [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-paper-muted [&_.recharts-layer]:outline-none [&_.recharts-surface]:outline-none";
