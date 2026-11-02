import { Scroll, Sheet, type SheetViewProps } from "@silk-hq/components";
import { ChevronDown } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useFetchers } from "react-router";
import { useMediaQuery } from "usehooks-ts";
import { fieldInput, focusRing } from "~/components/admin/helpers";
import { StackedCard } from "~/components/admin/sheets";
import { cn } from "~/lib/utils";

// The Admin tab's form sheets (Add person, Add booking): Silk's "sheet with
// keyboard" on phones, the floating card on the right on larger screens.

export function FormSheet({
  title,
  description,
  trigger,
  intent,
  submit,
  children,
}: {
  title: string;
  description: string;
  /** The button that opens the sheet. */
  trigger: ReactNode;
  /** The form's intent, so the phones' header button shows it is busy. */
  intent: string;
  /** The phones' header button: its word, and while it is busy. */
  submit: { label: string; busy: string };
  /**
   * The form, with the id the phones' header button submits. `ownSubmit`
   * says it ends in its own button, since phones have theirs in the header.
   */
  children: (form: {
    id: string;
    close: () => void;
    ownSubmit: boolean;
  }) => ReactNode;
}) {
  let [presented, setPresented] = useState(false);
  let [travelStatus, setTravelStatus] = useState("idleOutside");
  let isNarrow = useMediaQuery("(max-width: 767px)");
  let [isSmallDevice, setIsSmallDevice] = useState(isNarrow);
  let formId = useId();
  let close = () => setPresented(false);

  function present(value: boolean) {
    if (value) setIsSmallDevice(isNarrow);
    setPresented(value);
  }

  let status = { "data-travel-status": travelStatus };

  return (
    <Sheet.Root
      // Free to use for everyone and not commercialised, so the free
      // licence applies (https://silkhq.com/access).
      license="non-commercial"
      forComponent="closest"
      sheetRole="dialog"
      presented={presented}
      onPresentedChange={present}
    >
      <Sheet.Trigger asChild>{trigger}</Sheet.Trigger>

      {isSmallDevice ? (
        <KeyboardCard
          status={status}
          onTravelStatusChange={setTravelStatus}
          formId={formId}
          title={title}
          intent={intent}
          submit={submit}
        >
          <Sheet.Description className="text-[13px] text-ink-muted">
            {description}
          </Sheet.Description>
          {children({ id: formId, close, ownSubmit: false })}
        </KeyboardCard>
      ) : (
        <StackedCard
          isSmallDevice={false}
          status={status}
          onTravelStatusChange={setTravelStatus}
          dismissLabel="Close"
        >
          <div className="flex flex-col gap-6">
            <div>
              <Sheet.Title className="pr-8 text-lg font-bold tracking-tight sm:text-xl">
                {title}
              </Sheet.Title>
              <Sheet.Description className="mt-0.5 text-[13px] text-ink-muted">
                {description}
              </Sheet.Description>
            </div>
            {children({ id: formId, close, ownSubmit: true })}
          </div>
        </StackedCard>
      )}
    </Sheet.Root>
  );
}

/**
 * The phones' sheet, after Silk's "sheet with keyboard" example: a tall card
 * with Cancel and the form's button in a header that stays put, and the
 * fields in a scroll area that keeps them above the on-screen keyboard. The
 * keyboard goes away as soon as the sheet is swiped or scrolled.
 */
function KeyboardCard({
  status,
  onTravelStatusChange,
  formId,
  title,
  intent,
  submit,
  children,
}: {
  status: Record<string, string>;
  onTravelStatusChange: (status: string) => void;
  formId: string;
  title: string;
  intent: string;
  submit: { label: string; busy: string };
  children: ReactNode;
}) {
  let view = useRef<HTMLDivElement>(null);
  let busy = useFetchers().some(
    (fetcher) => fetcher.formData?.get("intent") === intent,
  );
  let dismissKeyboard: SheetViewProps["onTravel"] = ({ progress }) => {
    if (progress < 0.999) view.current?.focus();
  };
  let headerButton = cn(
    "rounded px-1 text-[15px] font-semibold disabled:opacity-50",
    focusRing,
  );

  return (
    <Sheet.Portal>
      <Sheet.View
        ref={view}
        {...status}
        className="admin-sheet-view keyboard-sheet-view"
        onTravelStatusChange={onTravelStatusChange}
        onTravel={dismissKeyboard}
        onPresentAutoFocus={{ focus: true }}
        contentPlacement="bottom"
        tracks="bottom"
        swipeOvershoot={false}
        nativeEdgeSwipePrevention
      >
        <Sheet.Backdrop
          className="admin-sheet-backdrop"
          travelAnimation={{ opacity: [0, 0.2] }}
          themeColorDimming="auto"
        />
        <Sheet.Outlet
          className="desk-sheet-blur"
          travelAnimation={{ opacity: [0, 1] }}
        />
        <Sheet.Content className="admin-sheet-content keyboard-sheet-content">
          <div className="admin-sheet-card font-display text-ink">
            <header className="grid flex-none grid-cols-[1fr_auto_1fr] items-center border-b border-line px-4 py-3">
              <Sheet.Trigger
                action="dismiss"
                className={cn(
                  headerButton,
                  "justify-self-start text-ink-muted",
                )}
              >
                Cancel
              </Sheet.Trigger>
              <Sheet.Title className="text-[17px] font-bold tracking-tight">
                {title}
              </Sheet.Title>
              <button
                type="submit"
                form={formId}
                disabled={busy}
                className={cn(headerButton, "justify-self-end text-moss-edge")}
              >
                {busy ? submit.busy : submit.label}
              </button>
            </header>
            <Scroll.Root asChild>
              <Scroll.View
                className="keyboard-sheet-scroll"
                safeArea="visual-viewport"
                scrollGestureTrap={{ yEnd: true }}
                onScrollStart={{ dismissKeyboard: true }}
              >
                <Scroll.Content className="flex flex-col gap-5 px-5 pb-6 pt-4">
                  {children}
                </Scroll.Content>
              </Scroll.View>
            </Scroll.Root>
          </div>
        </Sheet.Content>
      </Sheet.View>
    </Sheet.Portal>
  );
}

/** A labelled field with its error under it, read out with the field. */
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (props: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  }) => ReactNode;
}) {
  let id = useId();
  let errorId = `${id}-error`;

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] text-ink-muted">
        {label}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** A native select styled like the fields, with its chevron. */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(fieldInput, "appearance-none pr-9", className)}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
}
