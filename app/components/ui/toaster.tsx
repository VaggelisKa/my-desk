import { Cross2Icon } from "@radix-ui/react-icons";
import { Sheet, type TravelStatus } from "@silk-hq/components";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import { useToast } from "~/components/ui/use-toast";
import { cn } from "~/lib/utils";

const DEFAULT_DURATION = 5000;

/**
 * Toasts are a non-modal Silk sheet: they slide in from the top on phones
 * (clear of the dock) and from the right on desktop, can be swiped away,
 * and wait while the pointer rests on them.
 */
export function Toaster() {
  let { toasts, dismiss } = useToast();
  let current = toasts[0];
  let presented = current?.open === true;
  let isNarrow = useMediaQuery("(max-width: 767px)");
  let placement = isNarrow ? ("top" as const) : ("right" as const);
  let [travelStatus, setTravelStatus] = useState<TravelStatus>("idleOutside");
  // Hovered, or focused from the keyboard: either way someone is reading it.
  let [held, setHeld] = useState(false);
  let isError = current?.variant === "error";

  // The timer only runs once the toast has settled, so a slow entrance or a
  // half-finished swipe does not eat into the time it is readable.
  useEffect(() => {
    if (!presented || !current || held) return;
    if (travelStatus !== "idleInside") return;

    let timeout = setTimeout(
      () => dismiss(current.id),
      current.duration ?? DEFAULT_DURATION,
    );
    return () => clearTimeout(timeout);
  }, [presented, current, held, travelStatus, dismiss]);

  return (
    <>
      {/* Always in the page so screen readers hear each new toast; the
      sheet itself mounts and unmounts. */}
      <div role="status" aria-live="polite" className="sr-only">
        {presented && (
          <>
            {current.title} {current.description}
          </>
        )}
      </div>

      <Sheet.Root
        license="non-commercial"
        sheetRole=""
        presented={presented}
        onPresentedChange={(open) => {
          if (!open && current) dismiss(current.id);
        }}
      >
        <Sheet.Portal>
          <Sheet.View
            className={cn("toast-view", `toast-view-${placement}`)}
            data-toast-status={travelStatus}
            contentPlacement={placement}
            tracks={placement}
            inertOutside={false}
            onTravelStatusChange={setTravelStatus}
            onPresentAutoFocus={{ focus: false }}
            onDismissAutoFocus={{ focus: false }}
            onClickOutside={{ dismiss: false, stopOverlayPropagation: false }}
            onEscapeKeyDown={{ dismiss: false, stopOverlayPropagation: false }}
          >
            <Sheet.Content asChild className="toast-content">
              {/* Silk needs the special wrapper for swipes on Safari when a
              sheet has no backdrop. */}
              <Sheet.SpecialWrapper.Root>
                <Sheet.SpecialWrapper.Content className="toast-frame">
                  <div
                    data-toast={current?.variant ?? "success"}
                    className="toast-card font-display text-ink"
                    onPointerEnter={() => setHeld(true)}
                    onPointerLeave={() => setHeld(false)}
                    onFocus={() => setHeld(true)}
                    onBlur={() => setHeld(false)}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full",
                        isError
                          ? "bg-danger/10 text-danger"
                          : "bg-moss-soft text-moss",
                      )}
                    >
                      {isError ? (
                        <TriangleAlertIcon
                          className="size-4"
                          strokeWidth={2.25}
                        />
                      ) : (
                        <CheckIcon className="size-4" strokeWidth={2.75} />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
                      {current?.title && (
                        <Sheet.Title className="text-sm font-semibold leading-snug text-ink">
                          {current.title}
                        </Sheet.Title>
                      )}
                      {current?.description && (
                        <Sheet.Description className="text-[13px] leading-snug text-ink-muted">
                          {current.description}
                        </Sheet.Description>
                      )}
                    </div>
                    <Sheet.Trigger
                      action="dismiss"
                      aria-label="Dismiss"
                      className="-m-1 grid size-7 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-paper-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss"
                    >
                      <Cross2Icon className="size-3.5" />
                    </Sheet.Trigger>
                  </div>
                </Sheet.SpecialWrapper.Content>
              </Sheet.SpecialWrapper.Root>
            </Sheet.Content>
          </Sheet.View>
        </Sheet.Portal>
      </Sheet.Root>
    </>
  );
}
