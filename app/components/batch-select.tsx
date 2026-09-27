import { Check } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { rescueFocus } from "~/lib/focus";
import { bookingKey, cn, plural } from "~/lib/utils";

// Removing several bookings at once (design option A). "Select" beside the
// heading puts a list in select mode: rows get a check, the row's own remove
// button goes away, and a dark bar takes the dock's place with Cancel, the
// count and a red Remove (in Admin it asks once more before removing).

let focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2";

type Keyed = { deskId: number; date: string; userId: string };

/**
 * Select mode for a list of bookings. What is picked is kept by key, so a
 * booking that goes away (removed, filtered out) simply stops counting.
 */
export function useBatchSelect({
  bookings,
  action,
  intent,
}: {
  /** The bookings shown, in order. */
  bookings: Keyed[];
  /** Where the form goes, and the intent that removes several. */
  action: string;
  intent: string;
}) {
  let fetcher = useFetcher();
  let [selecting, setSelecting] = useState(false);
  let [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  let picked = bookings.filter((booking) => selected.has(bookingKey(booking)));
  // Hidden straight away; if removing fails the loader brings them back.
  let removing = new Set(fetcher.formData?.getAll("booking").map(String));

  let setMany = (keys: string[], on: boolean) =>
    setSelected((old) => {
      let next = new Set(old);
      for (let key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  // The bar goes away with select mode; if focus was in it, the page
  // heading takes it rather than the page body.
  let stop = () => {
    setSelecting(false);
    setSelected(new Set());
    rescueFocus();
  };

  return {
    selecting,
    count: picked.length,
    busy: fetcher.state !== "idle",
    isSelected: (booking: Keyed) => selected.has(bookingKey(booking)),
    isRemoving: (booking: Keyed) => removing.has(bookingKey(booking)),
    toggle: (booking: Keyed) => {
      let key = bookingKey(booking);
      setMany([key], !selected.has(key));
    },
    /** Picks all of `group`, or none of them when all are picked already. */
    toggleAll: (group: Keyed[]) => {
      let keys = group.map(bookingKey);
      setMany(keys, !keys.every((key) => selected.has(key)));
    },
    allSelected: (group: Keyed[]) =>
      group.length > 0 &&
      group.every((booking) => selected.has(bookingKey(booking))),
    start: () => setSelecting(true),
    stop,
    remove: () => {
      let form = new FormData();
      form.set("intent", intent);
      for (let booking of picked) form.append("booking", bookingKey(booking));
      void fetcher
        .submit(form, {
          method: action === "/admin" ? "post" : "DELETE",
          action,
        })
        .then(stop);
    },
  };
}

export type BatchSelect = ReturnType<typeof useBatchSelect>;

/**
 * "Select" beside the heading; in select mode it picks all of `all` (or
 * none, once all are picked).
 */
export function SelectButton({
  batch,
  all,
}: {
  batch: BatchSelect;
  all: Keyed[];
}) {
  if (all.length === 0) return null;

  let label = !batch.selecting
    ? "Select"
    : batch.allSelected(all)
      ? "Unselect all"
      : "Select all";

  return (
    <button
      type="button"
      onClick={() => (batch.selecting ? batch.toggleAll(all) : batch.start())}
      className={cn(
        "shrink-0 rounded text-[13px] font-semibold normal-case tracking-normal text-moss-edge hover:underline",
        focusRing,
      )}
    >
      {label}
    </button>
  );
}

/**
 * A row's round check, which slides in (width and fade) when select mode
 * starts and out when it ends. The input stretches over the nearest
 * positioned ancestor (the row), so a tap anywhere on the row picks it.
 */
export function RowCheck({
  shown,
  shownClassName,
  hiddenClassName,
  checked,
  onChange,
  label,
}: {
  shown: boolean;
  /** Margins that fit the check into the row once it is in. */
  shownClassName?: string;
  /** Margins that cancel the row's gap while it is out. */
  hiddenClassName?: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <span
      // Out of reach (tab, taps, screen readers) while hidden.
      inert={!shown}
      className={cn(
        "grid h-10 shrink-0 place-items-center transition-[width,margin,opacity,transform] duration-200 ease-out motion-reduce:transition-none",
        shown
          ? cn("w-10 opacity-100", shownClassName)
          : cn("pointer-events-none w-0 scale-50 opacity-0", hiddenClassName),
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="peer absolute inset-0 z-[1] size-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none"
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-moss peer-focus-visible:ring-offset-2",
          checked ? "border-moss bg-moss text-white" : "border-field bg-paper",
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </span>
  );
}

/**
 * The bar select mode shows: on phones in the dock's place (the dock hides
 * while it is up), on larger screens floating at the bottom. With `confirm`,
 * Remove asks once more before anything goes; without it (your own
 * bookings), Remove removes straight away.
 */
export function SelectionBar({
  batch,
  confirm = false,
}: {
  batch: BatchSelect;
  confirm?: boolean;
}) {
  let [asking, setAsking] = useState(false);
  let questionId = useId();
  // Set when Keep closes the question, so Remove gets focus back.
  let returnFocus = useRef(false);
  let focusOnReturn = (node: HTMLButtonElement | null) => {
    if (node && returnFocus.current) {
      returnFocus.current = false;
      node.focus();
    }
  };
  let { count, busy } = batch;
  // Unpicking everything while asked closes the question.
  let confirming = asking && count > 0;

  return (
    <>
      {/* Room below the list, so the bar never covers its last row. */}
      <div aria-hidden="true" className="h-16 md:h-20" />
      <div
        data-selection-bar
        className="fixed inset-x-0 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 font-display md:bottom-6"
      >
        <div
          role="region"
          aria-label="Selected bookings"
          className="enter flex w-full max-w-[420px] flex-col rounded-[28px] bg-[rgb(31_42_46/0.88)] p-[5px] text-white shadow-[0_14px_30px_-10px_rgb(31_42_46/0.55),0_2px_6px_rgb(31_42_46/0.2)] ring-1 ring-white/10 backdrop-blur-xl backdrop-saturate-150"
        >
          {/* The question opens above the buttons (and closes again) by
              growing its row, rather than popping in. */}
          <div
            aria-hidden={!confirming}
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
              confirming
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <p
                id={questionId}
                className="px-4 pb-2 pt-3 text-[15px] font-semibold"
              >
                Remove {plural(count, "booking")}? This can't be undone.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (confirming) {
                  returnFocus.current = true;
                  setAsking(false);
                } else {
                  batch.stop();
                }
              }}
              className="h-11 rounded-full px-4 text-[15px] font-semibold text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss-soft"
            >
              <span key={String(confirming)} className="swap block">
                {confirming ? "Keep" : "Cancel"}
              </span>
            </button>
            <span
              aria-live="polite"
              className="flex-1 text-center text-[15px] font-semibold"
            >
              <span key={String(confirming)} className="swap block">
                {confirming
                  ? ""
                  : count
                    ? `${count} selected`
                    : "Pick bookings"}
              </span>
            </span>
            {confirming ? (
              <button
                type="button"
                disabled={busy}
                onClick={batch.remove}
                // Focus lands here, so the question is read out with it.
                autoFocus
                aria-describedby={questionId}
                className="hover:bg-danger/90 h-11 rounded-full bg-danger px-5 text-[15px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:opacity-60"
              >
                <span className="swap block">
                  {busy ? "Removing..." : `Remove ${count}`}
                </span>
              </button>
            ) : (
              <button
                ref={focusOnReturn}
                type="button"
                disabled={count === 0 || busy}
                onClick={confirm ? () => setAsking(true) : batch.remove}
                className="hover:bg-danger/90 h-11 rounded-full bg-danger px-5 text-[15px] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:bg-white/10 disabled:text-white/50"
              >
                <span className="swap block">
                  {busy ? "Removing..." : "Remove"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
