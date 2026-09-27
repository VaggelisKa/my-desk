import { NavLink, useLocation, useNavigation } from "react-router";
import { cn } from "~/lib/utils";

let focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2";

/**
 * A sliding switch between sibling pages, like Upcoming · Recurring. Each tab
 * keeps it in its layout, so it stays mounted across the switch and the pill
 * slides rather than jumps. It moves as soon as you tap, not when the other
 * page has loaded, like the dock.
 */
export function SegmentSwitch({
  label,
  segments,
}: {
  label: string;
  segments: { to: string; label: string }[];
}) {
  let location = useLocation();
  let navigation = useNavigation();
  let pathname = navigation.location?.pathname ?? location.pathname;
  let active = Math.max(
    0,
    segments.findIndex((segment) => segment.to === pathname),
  );

  return (
    <nav
      aria-label={label}
      className="relative grid self-start rounded-full bg-paper-muted p-1 ring-1 ring-inset ring-line"
      style={{
        width: `${segments.length * 112 + 8}px`,
        maxWidth: "100%",
        gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))`,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-full bg-paper shadow-[0_1px_3px_rgb(31_42_46/0.14)] ring-1 ring-line transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.36,0.64,1)] motion-reduce:transition-none"
        style={{
          width: `calc(${100 / segments.length}% - ${8 / segments.length}px)`,
          transform: `translateX(${active * 100}%)`,
        }}
      />
      {segments.map(({ to, label }, index) => (
        <NavLink
          key={to}
          to={to}
          end
          prefetch="intent"
          preventScrollReset
          className={cn(
            "relative inline-flex h-9 items-center justify-center rounded-full px-3 text-[13px] font-semibold transition-colors duration-300",
            focusRing,
            index === active ? "text-ink" : "text-ink-muted hover:text-ink",
          )}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
