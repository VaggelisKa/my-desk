import {
  AutoFocusTarget,
  Scroll,
  Sheet,
  type SheetViewProps,
} from "@silk-hq/components";
import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFetchers } from "react-router";
import { useMediaQuery } from "usehooks-ts";
import { focusRing } from "~/components/admin/helpers";
import { useAdminFetcher, type AdminData } from "~/components/admin/shared";
import { StackedCard } from "~/components/admin/sheets";
import { Button } from "~/components/ui/button";
import { cn, deskLabel } from "~/lib/utils";

// Admin › People: adds someone who has not signed up yet, with the same
// checks as guest sign-up, and an unclaimed desk if they get one straight away.

export function AddPerson({ data }: { data: AdminData }) {
  let free = data.desks.filter((desk) => !desk.owner);
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
  let description = "They sign in with their user ID.";

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
      <Sheet.Trigger asChild>
        <Button
          type="button"
          variant="quiet"
          size="tall"
          aria-label="Add person"
          className="gap-1.5"
        >
          <Plus aria-hidden="true" className="-ml-0.5 size-4" />
          {/* Phones say less, so the search keeps room for its hint. */}
          <span className="sm:hidden">Add</span>
          <span className="hidden sm:inline">Add person</span>
        </Button>
      </Sheet.Trigger>

      {isSmallDevice ? (
        <KeyboardCard
          status={status}
          onTravelStatusChange={setTravelStatus}
          formId={formId}
        >
          <Sheet.Description className="text-[13px] text-ink-muted">
            {description}
          </Sheet.Description>
          <AddPersonForm id={formId} free={free} onDone={close} />
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
                Add person
              </Sheet.Title>
              <Sheet.Description className="mt-0.5 text-[13px] text-ink-muted">
                {description}
              </Sheet.Description>
            </div>
            <AddPersonForm id={formId} free={free} onDone={close} submit />
          </div>
        </StackedCard>
      )}
    </Sheet.Root>
  );
}

/**
 * The phones' sheet, after Silk's "sheet with keyboard" example: a tall card
 * with Cancel and Add in a header that stays put, and the fields in a scroll
 * area that keeps them above the on-screen keyboard. The keyboard opens with
 * the sheet and goes away as soon as the sheet is swiped or scrolled.
 */
function KeyboardCard({
  status,
  onTravelStatusChange,
  formId,
  children,
}: {
  status: Record<string, string>;
  onTravelStatusChange: (status: string) => void;
  formId: string;
  children: ReactNode;
}) {
  let view = useRef<HTMLDivElement>(null);
  let busy = useFetchers().some(
    (fetcher) => fetcher.formData?.get("intent") === "add-person",
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
                Add person
              </Sheet.Title>
              <button
                type="submit"
                form={formId}
                disabled={busy}
                className={cn(headerButton, "justify-self-end text-moss-edge")}
              >
                {busy ? "Adding..." : "Add"}
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

let input =
  "h-11 w-full rounded-[10px] border border-field bg-paper px-3 text-base text-ink placeholder:text-ink-muted focus-visible:border-moss focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-moss aria-[invalid]:border-danger";

function AddPersonForm({
  id,
  free,
  onDone,
  submit,
}: {
  id: string;
  free: AdminData["desks"];
  onDone: () => void;
  /** Ends in its own Add button; phones have theirs in the header. */
  submit?: boolean;
}) {
  let form = useRef<HTMLFormElement>(null);
  // The sheet drops the form when it closes, so it opens empty next time.
  let fetcher = useAdminFetcher(onDone);
  let busy = fetcher.state !== "idle";
  let errors = fetcher.data?.ok === false ? fetcher.data.errors : undefined;

  // A refused try moves focus to the first field it names.
  useEffect(() => {
    if (fetcher.state === "idle" && errors) {
      form.current?.querySelector<HTMLElement>("[aria-invalid]")?.focus();
    }
  }, [fetcher.state, errors]);

  return (
    <fetcher.Form
      id={id}
      ref={form}
      method="post"
      action="/admin"
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void fetcher.submit(event.currentTarget);
      }}
    >
      <input type="hidden" name="intent" value="add-person" />
      <Field label="User ID" error={errors?.id}>
        {/* Focused as the sheet opens, which brings up the phone's keyboard. */}
        {(props) => (
          <AutoFocusTarget.Root asChild timing="present">
            <input
              {...props}
              name="userId"
              required
              maxLength={6}
              placeholder="G12345"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              className={cn(input, "uppercase placeholder:normal-case")}
            />
          </AutoFocusTarget.Root>
        )}
      </Field>
      <Field label="First name" error={errors?.firstName}>
        {(props) => (
          <input
            {...props}
            name="firstName"
            required
            autoComplete="off"
            className={input}
          />
        )}
      </Field>
      <Field label="Last name" error={errors?.lastName}>
        {(props) => (
          <input
            {...props}
            name="lastName"
            required
            autoComplete="off"
            className={input}
          />
        )}
      </Field>
      {free.length > 0 && (
        <Field label="Desk" error={errors?.deskId}>
          {(props) => (
            <div className="relative">
              <select
                {...props}
                name="deskId"
                defaultValue=""
                className={cn(input, "appearance-none pr-9")}
              >
                <option value="">No desk</option>
                {free.map((desk) => (
                  <option key={desk.id} value={desk.id}>
                    Desk {deskLabel(desk)}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
              />
            </div>
          )}
        </Field>
      )}
      {submit && (
        <Button
          type="submit"
          variant="primary"
          size="tall"
          disabled={busy}
          className="mt-1"
        >
          {busy ? "Adding..." : "Add person"}
        </Button>
      )}
    </fetcher.Form>
  );
}

/** A labelled field with its error under it, read out with the field. */
function Field({
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
