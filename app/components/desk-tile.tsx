import * as React from "react";
import { cn } from "~/lib/utils";

export type DeskTileState = "free" | "taken" | "mine";

type DeskTileProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** First name of the assigned user. Empty for an unclaimed desk. */
  name?: string | null;
  /** Desk number as shown to people, e.g. "3.2.1". */
  label: string;
  /** Row inside the block; decides which side the chair sits on. */
  row: number;
  state?: DeskTileState;
  /** First name of whoever has the desk on the shown day, when it is not the owner. */
  sitter?: string | null;
  /** Filtered out: drawn as an outline and not clickable. */
  dimmed?: boolean;
};

let stateWords: Record<DeskTileState, string> = {
  free: "Free",
  taken: "Taken",
  mine: "Yours",
};

/**
 * A desk drawn as a flat slab with a solid lower edge, the one raised thing in
 * the design. The accessible name is the owner's first name (or "Unclaimed"),
 * which the desk map, tests and screen readers all key on; the number, state
 * and who is sitting there are read out as the description.
 *
 * The state is written on the tile as well as coloured, so it reads without
 * telling the colours apart. The desk number lives in the sheet instead.
 */
export let DeskTile = React.forwardRef<HTMLButtonElement, DeskTileProps>(
  (
    {
      name,
      label,
      row,
      state = "free",
      sitter,
      dimmed = false,
      className,
      disabled,
      ...rest
    },
    ref,
  ) => {
    let unclaimed = !name;
    let status = dimmed ? "Filtered out" : stateWords[state];
    let descriptionId = React.useId();
    let description = [
      `Desk ${label}`,
      status.toLowerCase(),
      sitter ? `${sitter} is sitting here` : null,
    ]
      .filter(Boolean)
      .join(", ");

    return (
      <button
        ref={ref}
        type="button"
        aria-label={name || "Unclaimed"}
        aria-describedby={descriptionId}
        disabled={disabled ?? dimmed}
        data-state={state}
        data-dimmed={dimmed || undefined}
        className={cn(
          "group relative block h-11 w-full font-display focus-visible:outline-none sm:h-[50px]",
          dimmed && "cursor-not-allowed",
          className,
        )}
        {...rest}
      >
        <span id={descriptionId} className="sr-only">
          {description}
        </span>

        <span
          aria-hidden="true"
          className={cn(
            "absolute left-1/2 -ml-[11px] h-2.5 w-[22px] rounded-b-md rounded-t border-[1.5px] border-ink bg-paper-muted",
            row === 1 ? "-top-3.5" : "top-full mt-2.5",
            (dimmed || unclaimed) && "opacity-35",
          )}
        />

        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-px rounded border-[1.5px] px-1.5 transition-[transform,box-shadow] duration-150 motion-reduce:transition-none",
            "[--edge:var(--ink)]",
            // Lift on hover, and outline when focused or while its sheet is open.
            "group-enabled:group-hover:-translate-y-0.5 group-enabled:group-hover:shadow-[0_8px_0_var(--edge)]",
            "group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-moss",
            "group-aria-expanded:outline group-aria-expanded:outline-2 group-aria-expanded:outline-offset-[3px] group-aria-expanded:outline-moss",
            state === "free" &&
              "border-ink bg-paper text-ink-muted shadow-[0_6px_0_var(--edge)]",
            state === "free" &&
              unclaimed &&
              "border-line shadow-[0_6px_0_var(--line)]",
            state === "taken" &&
              "border-ink bg-taken text-white shadow-[0_6px_0_var(--edge)]",
            state === "mine" &&
              "border-moss-edge bg-moss text-white shadow-[0_6px_0_var(--edge)] [--edge:var(--moss-edge)]",
            dimmed &&
              "border-dashed border-dim bg-transparent text-ink-muted shadow-none",
          )}
        >
          <span
            className={cn(
              "max-w-full truncate text-[11.5px] font-bold capitalize leading-[1.1] sm:text-[12.5px]",
              unclaimed && "font-semibold",
            )}
          >
            {name || "Unclaimed"}
          </span>
          <span className="max-w-full truncate text-[10px] font-semibold leading-none tracking-[0.02em] sm:text-[10.5px]">
            {status}
          </span>
        </span>
      </button>
    );
  },
);
DeskTile.displayName = "DeskTile";
