import { format, isSameMonth } from "date-fns";
import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  barAt,
  barIndexAt,
  valueTicks,
  visibleLabels,
  type Plot,
} from "~/lib/bar-chart";
import type { bookingsBy, Period } from "~/lib/metrics";

// The Metrics bar chart, drawn by hand as SVG: stacked bars (own desk, then
// striped guests), the total above each bar, a dashed grid and a tooltip.
// The layout numbers copy the chart library it replaced, so it looks the same.

let MOSS = "#4f7a5a";
let MOSS_SOFT = "#e2ede5";

// Room around the bars: the value labels sit on the left, the dates below.
let TOP = 22;
let LEFT = 48;
let RIGHT = 4;
let BOTTOM = 30;
let FONT_SIZE = 11;
// The smallest gap between two date labels; closer ones are skipped.
let MIN_LABEL_GAP = 8;

type Row = ReturnType<typeof bookingsBy>[number];

type ChartProps = {
  data: Row[];
  period: Period;
  now: Date;
};

/**
 * The guest stripes, used by the bars and the legend swatch. It lives in the
 * legend, which is always on the page, so the swatch has it even before the
 * chart is drawn.
 */
export function GuestHatch() {
  return (
    <defs>
      <pattern
        id="guest-hatch"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="6" height="6" fill={MOSS_SOFT} />
        <line x1="0" y1="0" x2="0" y2="6" stroke={MOSS} strokeWidth="3" />
      </pattern>
    </defs>
  );
}

let measureContext: CanvasRenderingContext2D | null = null;

function textWidth(text: string, font: string) {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) {
    return text.length * FONT_SIZE * 0.6;
  }
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

/** A bar with rounded top corners, like the guest part on top of a stack. */
function roundedTop(x: number, y: number, w: number, h: number) {
  let r = Math.min(4, w / 2, h / 2);
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
}

function ChartTip({ row, period }: { row: Row; period: Period }) {
  return (
    <>
      <div className="mb-1 font-semibold text-ink">
        {format(
          row.start,
          period === "weeks" ? "'Week of' d MMM" : "MMMM yyyy",
        )}
      </div>
      {[
        { name: "At their own desk", value: row.own },
        { name: "Guests", value: row.guests },
      ].map((item) => (
        <div
          key={item.name}
          className="flex justify-between gap-4 text-ink-muted"
        >
          <span>{item.name}</span>
          <span className="font-semibold tabular-nums text-ink">
            {item.value}
          </span>
        </div>
      ))}
    </>
  );
}

export function BookingsBarChart({ data, period, now }: ChartProps) {
  let frame = useRef<HTMLDivElement>(null);
  let tip = useRef<HTMLDivElement>(null);
  let [box, setBox] = useState<{ width: number; height: number } | null>(null);
  let [font, setFont] = useState("");
  // Label widths are measured in the web font, so draw again once it is in.
  let [, fontsLoaded] = useReducer((n: number) => n + 1, 0);
  // The bar under the pointer, how far down the pointer is, and which
  // grouping it was: switching to months leaves nothing selected.
  let [active, setActive] = useState<{
    index: number;
    y: number;
    period: Period;
  } | null>(null);
  let tipShown = useRef(false);

  // The chart is as wide as the page allows, so it is drawn once the browser
  // has laid out its box, and again whenever that box changes size.
  useLayoutEffect(() => {
    let el = frame.current;
    if (!el) {
      return;
    }
    setFont(`${FONT_SIZE}px ${getComputedStyle(el).fontFamily}`);
    let observer = new ResizeObserver(() =>
      setBox({ width: el.clientWidth, height: el.clientHeight }),
    );
    observer.observe(el);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) {
        fontsLoaded();
      }
    });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  let plot: Plot = {
    left: LEFT,
    top: TOP,
    width: box ? Math.max(0, box.width - LEFT - RIGHT) : 0,
    height: box ? Math.max(0, box.height - TOP - BOTTOM) : 0,
  };
  let { slot } = barAt(plot, data.length, 0);
  let ticks = valueTicks(Math.max(0, ...data.map((row) => row.total)));
  let y = (value: number) =>
    plot.top + plot.height - (value / ticks[4]) * plot.height;
  let shown = active?.period === period ? active : null;
  let activeRow = shown ? data[shown.index] : undefined;

  // A finger's tooltip stays up after the tap; a tap anywhere else on the
  // page puts it away.
  let hasTip = activeRow != null;
  useEffect(() => {
    if (!hasTip) {
      return;
    }
    function away(event: globalThis.PointerEvent) {
      if (
        event.pointerType !== "mouse" &&
        !frame.current?.contains(event.target as Node)
      ) {
        setActive(null);
      }
    }
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [hasTip]);

  // Keep the tooltip beside the pointer and inside the chart, flipping it to
  // the other side near the right and bottom edges.
  useLayoutEffect(() => {
    let el = tip.current;
    if (!el || !box || !shown) {
      tipShown.current = false;
      return;
    }
    let x = LEFT + slot * (shown.index + 0.5);
    let left =
      x + 10 + el.offsetWidth > box.width
        ? Math.max(0, x - el.offsetWidth - 10)
        : x + 10;
    let top =
      shown.y + 10 + el.offsetHeight > box.height
        ? Math.max(0, shown.y - el.offsetHeight - 10)
        : shown.y + 10;
    el.style.transition = tipShown.current ? "transform 400ms ease" : "";
    el.style.transform = `translate(${left}px, ${top}px)`;
    tipShown.current = true;
  }, [shown, slot, box]);

  function onPointer(event: PointerEvent<SVGSVGElement>) {
    let rect = event.currentTarget.getBoundingClientRect();
    let py = event.clientY - rect.top;
    let index = barIndexAt(plot, data.length, event.clientX - rect.left, py);
    setActive(index == null ? null : { index, y: py, period });
  }

  let dateLabels = data.map((row) =>
    period === "weeks"
      ? format(row.start, "d MMM")
      : isSameMonth(row.start, now)
        ? `${format(row.start, "MMM")} so far`
        : format(row.start, "MMM"),
  );
  let labelAt = box
    ? visibleLabels(
        data.map((_, i) => LEFT + slot * (i + 0.5)),
        dateLabels.map((label) => textWidth(label, font)),
        LEFT,
        LEFT + plot.width,
        MIN_LABEL_GAP,
      )
    : [];

  return (
    <div
      ref={frame}
      aria-hidden
      className="relative h-[240px] text-xs sm:h-[300px]"
    >
      {box && (
        // Out of the flow, so its drawn width never holds the frame open
        // while the page narrows. Sideways drags move between bars; up and
        // down still scroll the page.
        <svg
          className="bookings-chart absolute inset-0 touch-pan-y"
          width={box.width}
          height={box.height}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={(event) => {
            // A tap leaves the tooltip up, as on a phone there is no
            // hovering away from a bar.
            if (event.pointerType === "mouse") {
              setActive(null);
            }
          }}
          // The page took the touch over to scroll.
          onPointerCancel={() => setActive(null)}
        >
          {ticks.map((tick) => (
            <line
              key={tick}
              x1={LEFT}
              x2={LEFT + plot.width}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-line"
              strokeDasharray="3 3"
            />
          ))}

          <g className="fill-ink-muted" fontSize={FONT_SIZE}>
            {data.map((row, i) =>
              labelAt[i] == null ? null : (
                <text
                  key={row.start}
                  x={labelAt[i]}
                  y={TOP + plot.height + 16}
                  dy="0.71em"
                  textAnchor="middle"
                >
                  {dateLabels[i]}
                </text>
              ),
            )}
            {ticks.map((tick) => (
              <text
                key={tick}
                x={LEFT - 8}
                y={y(tick)}
                dy="0.355em"
                textAnchor="end"
              >
                {tick}
              </text>
            ))}
          </g>

          {shown && activeRow && (
            <rect
              x={LEFT + slot * shown.index}
              y={TOP}
              width={slot}
              height={plot.height}
              className="fill-paper-muted"
            />
          )}

          {data.map((row, i) => {
            let bar = barAt(plot, data.length, i);
            let ownTop = y(row.own);
            let totalTop = y(row.total);

            return (
              <g key={row.start}>
                {row.own > 0 && (
                  <rect
                    x={bar.x}
                    y={ownTop}
                    width={bar.width}
                    height={y(0) - ownTop}
                    className="fill-ink"
                  />
                )}
                {row.guests > 0 && (
                  <path
                    d={roundedTop(
                      bar.x,
                      totalTop,
                      bar.width,
                      ownTop - totalTop,
                    )}
                    fill="url(#guest-hatch)"
                    stroke={MOSS}
                  />
                )}
                <text
                  x={bar.x + bar.width / 2}
                  y={totalTop - 6}
                  textAnchor="middle"
                  fontSize={FONT_SIZE}
                  fontWeight={600}
                  className="fill-ink"
                >
                  {row.total}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {activeRow && (
        <div
          ref={tip}
          className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap rounded-lg bg-paper px-3 py-2 text-[12px] shadow-[0_4px_16px_rgb(31_42_46/0.14)] ring-1 ring-line"
        >
          <ChartTip row={activeRow} period={period} />
        </div>
      )}
    </div>
  );
}
