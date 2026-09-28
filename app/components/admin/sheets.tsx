import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Sheet } from "@silk-hq/components";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";
import { useMediaQuery } from "usehooks-ts";
import { focusRing, rowClass } from "~/components/admin/helpers";
import { listClass, useAdminFetcher } from "~/components/admin/shared";
import { Button } from "~/components/ui/button";
import { rescueFocus } from "~/lib/focus";
import { cn } from "~/lib/utils";

// The sheet kit every Admin list shares: settings rows, confirm steps, and
// the sheets themselves (stacked cards on phones, one card per action on
// desktop, opened from the row's Manage menu).

/**
 * A link that asks once more before it posts: the first tap swaps it for
 * the question, the real button and "Keep". Built into the page because the
 * browser's confirm() is easy to click through and looks out of place.
 */
export function ConfirmAction({
  label,
  question,
  confirmLabel,
  fields,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  fields: Record<string, string | number>;
}) {
  let fetcher = useFetcher();
  let [asking, setAsking] = useState(false);
  let busy = fetcher.state !== "idle";
  let questionId = useId();
  // Set when the question closes with focus inside it, so the button that
  // asked gets focus back rather than the page.
  let returnFocus = useRef(false);
  let focusOnReturn = (node: HTMLButtonElement | null) => {
    if (node && returnFocus.current) {
      returnFocus.current = false;
      node.focus();
    }
  };

  if (!asking) {
    return (
      <button
        ref={focusOnReturn}
        type="button"
        onClick={() => setAsking(true)}
        className={cn(
          "rounded text-[13px] font-semibold normal-case tracking-normal text-danger hover:underline",
          focusRing,
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action="/admin"
      onSubmit={(event) => {
        event.preventDefault();
        let form = event.currentTarget;
        let hadFocus = form.contains(document.activeElement);
        // What was asked about may be gone afterwards (the bookings it
        // cleared, the owner it removed); then focus goes to the sheet.
        let home = form.closest<HTMLElement>("[data-sheet-step]");
        void fetcher.submit(form).then(() => {
          returnFocus.current = hadFocus;
          setAsking(false);
          if (hadFocus) rescueFocus(home);
        });
      }}
      className="border-danger/40 bg-danger/5 flex w-full basis-full flex-col gap-2.5 rounded-[10px] border px-3.5 py-3 text-[13px] font-normal normal-case leading-snug tracking-normal text-ink"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p id={questionId}>{question}</p>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="tall"
          variant="primary"
          disabled={busy}
          autoFocus
          // Focus lands here, so the question is read out with it.
          aria-describedby={questionId}
          className="hover:bg-danger/90 flex-1 bg-danger focus-visible:ring-danger"
        >
          {busy ? "Working..." : confirmLabel}
        </Button>
        <Button
          type="button"
          variant="quiet"
          size="tall"
          className="flex-1"
          onClick={(event) => {
            returnFocus.current = event.currentTarget.contains(
              document.activeElement,
            );
            setAsking(false);
          }}
        >
          Keep
        </Button>
      </div>
    </fetcher.Form>
  );
}

/** A settings-style group: rows that show a value and open a page. */
export function SettingsList({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  let id = useId();
  return (
    <div className="grid gap-2">
      {title && (
        <h3 id={id} className="px-1 text-[13px] text-ink-muted">
          {title}
        </h3>
      )}
      <ul className={listClass} aria-labelledby={title ? id : undefined}>
        {children}
      </ul>
    </div>
  );
}

/**
 * One row of a settings list. With `onClick` it opens its page and ends in a
 * chevron; without, it only shows the value.
 */
export function SettingsRow({
  label,
  value,
  valueClassName,
  onClick,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  onClick?: () => void;
}) {
  let content = (
    <>
      <span className="shrink-0 text-[15px] font-medium">{label}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-right text-[15px] text-ink-muted",
          valueClassName,
        )}
      >
        {value}
      </span>
      {onClick && (
        <ChevronRight
          aria-hidden="true"
          className="-mr-1 size-4 shrink-0 text-ink-muted"
        />
      )}
    </>
  );

  return (
    <li className="border-b border-line last:border-b-0">
      {onClick ? (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={onClick}
          className={cn(rowClass, "min-h-12 border-b-0")}
        >
          {content}
        </button>
      ) : (
        <div
          className={cn(rowClass, "min-h-12 border-b-0 hover:bg-transparent")}
        >
          {content}
        </div>
      )}
    </li>
  );
}

/** A red settings row that does its thing straight away, no page. */
export function SettingsAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          rowClass,
          "min-h-12 border-b-0 text-[15px] font-medium text-danger",
        )}
      >
        {label}
      </button>
    </li>
  );
}

/**
 * Steps inside a page (pick, then confirm). Moving on replaces the button
 * you pressed, so the new step takes focus instead of the page.
 */
export function useSteps<T extends object>(first: T) {
  let [step, setStep] = useState(first);
  let [count, setCount] = useState(0);
  let moved = useRef(false);

  function go(next: T) {
    moved.current = true;
    setStep(next);
    setCount((n) => n + 1);
  }

  let frame = {
    tabIndex: -1,
    className: "flex flex-col gap-5 focus:outline-none",
    ref: (node: HTMLDivElement | null) => {
      if (node && moved.current) {
        moved.current = false;
        node.focus();
      }
    },
  };

  // A new key per step, so each step mounts fresh and takes focus.
  return [step, go, frame, count] as const;
}

/** The last step of a page: what will happen, and the button that does it. */
export function ConfirmStep({
  question,
  confirmLabel,
  fields,
  tone = "danger",
  onDone,
}: {
  question?: string;
  confirmLabel: string;
  fields: Record<string, string | number>;
  tone?: "danger" | "primary";
  onDone: () => void;
}) {
  let fetcher = useAdminFetcher(onDone);
  let busy = fetcher.state !== "idle";
  let questionId = useId();

  return (
    <fetcher.Form
      method="post"
      action="/admin"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void fetcher.submit(event.currentTarget);
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {question && (
        <p
          id={questionId}
          className="rounded-[10px] bg-paper-muted px-3.5 py-3 text-[13px] leading-snug"
        >
          {question}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="tall"
        disabled={busy}
        aria-describedby={question ? questionId : undefined}
        className={cn(
          tone === "danger" &&
            "hover:bg-danger/90 bg-danger focus-visible:ring-danger",
        )}
      >
        {busy ? "Working..." : confirmLabel}
      </Button>
    </fetcher.Form>
  );
}

type Sub =
  | "owner"
  | "bookings"
  | "desk"
  | "name"
  | "role"
  | "weekly"
  | "unassign";

/** An item of the desktop actions menu, and the page it opens. */
export type Action = {
  label: string;
  danger?: boolean;
} & (
  | { sub: Sub; run?: never }
  /** Posts these fields straight away, no sheet. */
  | { run: Record<string, string | number>; sub?: never }
);

type Page = { title: string; description: string; body: ReactNode };

/**
 * The admin sheet, built on Silk's "sheet with stacking" pattern: a floating
 * card from the bottom on phones and from the right on larger screens. It
 * lists settings rows, and each row opens its page as a second card of the
 * same size stacked on top, which nudges this one back so its edge peeks
 * out. Closing the page (Back, a swipe, Escape) comes back here.
 */
export function AdminSheet({
  trigger,
  title,
  titleClassName,
  description,
  rows,
  page,
  menu,
}: {
  trigger: ReactNode;
  title: string;
  titleClassName?: string;
  description: string;
  rows: (open: (sub: Sub) => void) => ReactNode;
  page: (sub: Sub, close: () => void) => Page;
  menu?: { label: string; actions: Action[] };
}) {
  if (menu) {
    return (
      <ActionsMenu
        trigger={trigger}
        label={menu.label}
        actions={menu.actions}
        page={page}
      />
    );
  }

  return (
    <StackedAdminSheet
      trigger={trigger}
      title={title}
      titleClassName={titleClassName}
      description={description}
      rows={rows}
      page={page}
    />
  );
}

/**
 * On larger screens a row's Manage button opens a menu of its actions, and
 * each action opens one sheet with just that page.
 */
function ActionsMenu({
  trigger,
  label,
  actions,
  page,
}: {
  trigger: ReactNode;
  label: string;
  actions: Action[];
  page: (sub: Sub, close: () => void) => Page;
}) {
  let fetcher = useFetcher();
  let [presented, setPresented] = useState(false);
  let [sub, setSub] = useState<Sub | null>(null);
  let [opened, setOpened] = useState(0);
  let [travelStatus, setTravelStatus] = useState("idleOutside");

  function open(next: Sub) {
    setSub(next);
    setOpened((n) => n + 1);
    setPresented(true);
  }

  let current = sub && page(sub, () => setPresented(false));

  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            // Back to the page, not the row, when a sheet takes over.
            onCloseAutoFocus={(event) => presented && event.preventDefault()}
            className="z-30 min-w-56 rounded-xl border border-line bg-paper p-1.5 font-display text-ink shadow-[0_12px_32px_rgb(0_0_0/0.14)]"
          >
            <DropdownMenu.Label className="truncate px-2.5 pb-1.5 pt-1 text-xs capitalize text-ink-muted">
              {label}
            </DropdownMenu.Label>
            {actions.map((action, i) => (
              <Fragment key={action.label}>
                {action.danger && !actions[i - 1]?.danger && (
                  <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line" />
                )}
                <DropdownMenu.Item
                  onSelect={() =>
                    action.run
                      ? void fetcher.submit(action.run, {
                          method: "post",
                          action: "/admin",
                        })
                      : open(action.sub)
                  }
                  aria-haspopup={action.sub ? "dialog" : undefined}
                  className={cn(
                    "flex cursor-pointer select-none items-center justify-between gap-4 rounded-lg px-2.5 py-2 text-sm font-medium outline-none data-[highlighted]:bg-paper-muted",
                    action.danger && "text-danger",
                  )}
                >
                  {action.label}
                  {action.sub && (
                    <ChevronRight
                      aria-hidden="true"
                      className="-mr-0.5 size-4 shrink-0 text-ink-muted"
                    />
                  )}
                </DropdownMenu.Item>
              </Fragment>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Sheet.Root
        license="non-commercial"
        forComponent="closest"
        sheetRole="dialog"
        presented={presented && current !== null}
        onPresentedChange={setPresented}
      >
        <StackedCard
          isSmallDevice={false}
          status={{ "data-travel-status": travelStatus }}
          onTravelStatusChange={setTravelStatus}
          dismissLabel="Close"
        >
          {current && <PageBody key={opened} page={current} />}
        </StackedCard>
      </Sheet.Root>
    </>
  );
}

/** The phones' sheet: settings rows, each opening a page stacked on top. */
function StackedAdminSheet({
  trigger,
  title,
  titleClassName,
  description,
  rows,
  page,
}: {
  trigger: ReactNode;
  title: string;
  titleClassName?: string;
  description: string;
  rows: (open: (sub: Sub) => void) => ReactNode;
  page: (sub: Sub, close: () => void) => Page;
}) {
  let [presented, setPresented] = useState(false);
  let [sub, setSub] = useState<Sub | null>(null);
  let [subPresented, setSubPresented] = useState(false);
  let [opened, setOpened] = useState(0);
  let [travelStatus, setTravelStatus] = useState("idleOutside");
  let isNarrow = useMediaQuery("(max-width: 767px)");
  let [isSmallDevice, setIsSmallDevice] = useState(isNarrow);

  function present(value: boolean) {
    if (value) setIsSmallDevice(isNarrow);
    setSubPresented(false);
    setPresented(value);
  }

  function open(next: Sub) {
    setSub(next);
    setOpened((n) => n + 1);
    setSubPresented(true);
  }

  let current = sub && page(sub, () => setSubPresented(false));

  return (
    <Sheet.Root
      // Free to use for everyone and not commercialised, so the free
      // licence applies (https://silkhq.com/access).
      license="non-commercial"
      // The Admin tab's own stack, so its page can stack on it.
      forComponent="closest"
      sheetRole="dialog"
      presented={presented}
      onPresentedChange={(value) => present(value)}
    >
      <Sheet.Trigger asChild>{trigger}</Sheet.Trigger>

      <StackedCard
        isSmallDevice={isSmallDevice}
        // Lets tests wait for the sheet to come to rest, as on the desk sheet.
        status={{ "data-travel-status": travelStatus }}
        onTravelStatusChange={setTravelStatus}
        dismissLabel="Close"
        blur
      >
        <div className="flex flex-col gap-6">
          <div>
            <Sheet.Title
              className={cn(
                "pr-8 text-lg font-bold tracking-tight sm:text-xl",
                titleClassName,
              )}
            >
              {title}
            </Sheet.Title>
            <Sheet.Description className="mt-0.5 text-[13px] text-ink-muted">
              {description}
            </Sheet.Description>
          </div>
          {rows(open)}
        </div>

        <PageSheet
          key={opened}
          isSmallDevice={isSmallDevice}
          presented={subPresented}
          onPresentedChange={setSubPresented}
          page={current}
        />
      </StackedCard>
    </Sheet.Root>
  );
}

/** A page of the admin sheet, stacked on top of it. */
function PageSheet({
  isSmallDevice,
  presented,
  onPresentedChange,
  page,
}: {
  isSmallDevice: boolean;
  presented: boolean;
  onPresentedChange: (value: boolean) => void;
  page: Page | null;
}) {
  let [travelStatus, setTravelStatus] = useState("idleOutside");

  return (
    <Sheet.Root
      license="non-commercial"
      forComponent="closest"
      sheetRole="dialog"
      presented={presented && page !== null}
      onPresentedChange={onPresentedChange}
    >
      <StackedCard
        isSmallDevice={isSmallDevice}
        status={{ "data-page-status": travelStatus }}
        onTravelStatusChange={setTravelStatus}
        dismissLabel="Back"
      >
        {page && <PageBody page={page} back />}
      </StackedCard>
    </Sheet.Root>
  );
}

/** A page's title, then what it does. `back` adds a Back link above. */
function PageBody({ page, back }: { page: Page; back?: boolean }) {
  return (
    <div
      data-sheet-step
      tabIndex={-1}
      className="flex flex-col gap-5 focus:outline-none"
    >
      <div className="flex flex-col gap-2">
        {back && (
          <Sheet.Trigger
            action="dismiss"
            className={cn(
              "-ml-1 inline-flex w-fit items-center gap-0.5 rounded text-[15px] font-semibold text-moss-edge hover:text-moss",
              focusRing,
            )}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Back
          </Sheet.Trigger>
        )}
        <div>
          <Sheet.Title className="pr-8 text-lg font-bold tracking-tight sm:text-xl">
            {page.title}
          </Sheet.Title>
          <Sheet.Description className="mt-0.5 text-[13px] capitalize text-ink-muted">
            {page.description}
          </Sheet.Description>
        </div>
      </div>
      {page.body}
    </div>
  );
}

/**
 * The floating card every admin sheet uses. Every card in the stack is the same
 * size, so the one underneath shows as an edge above (phones) or beside
 * (larger screens) the one on top.
 */
export function StackedCard({
  isSmallDevice,
  status,
  onTravelStatusChange,
  dismissLabel,
  blur,
  children,
}: {
  isSmallDevice: boolean;
  status: Record<string, string>;
  onTravelStatusChange: (status: string) => void;
  dismissLabel: string;
  /** Blurs the page behind on phones, like the app's other sheets. */
  blur?: boolean;
  children: ReactNode;
}) {
  let placement = isSmallDevice ? ("bottom" as const) : ("right" as const);

  return (
    <Sheet.Portal>
      <Sheet.View
        {...status}
        className={cn("admin-sheet-view", `admin-sheet-${placement}`)}
        onTravelStatusChange={onTravelStatusChange}
        contentPlacement={placement}
        tracks={placement}
        swipeOvershoot={isSmallDevice}
        nativeEdgeSwipePrevention
      >
        <Sheet.Backdrop
          className="admin-sheet-backdrop"
          travelAnimation={{ opacity: [0, 0.2] }}
          themeColorDimming="auto"
        />
        {blur && isSmallDevice && (
          <Sheet.Outlet
            className="desk-sheet-blur"
            travelAnimation={{ opacity: [0, 1] }}
          />
        )}
        <Sheet.Content
          className="admin-sheet-content"
          stackingAnimation={isSmallDevice ? stackUp : stackLeft}
        >
          <div className="admin-sheet-card">
            {isSmallDevice && (
              <Sheet.Handle
                className="desk-sheet-handle"
                action="dismiss"
                aria-label={dismissLabel}
              />
            )}
            {/* The close button sits in the scrolling body, so it scrolls
            away with the title instead of floating over the content. */}
            <div className="admin-sheet-body relative font-display text-ink">
              {!isSmallDevice && (
                <Sheet.Trigger
                  action="dismiss"
                  aria-label="Close"
                  className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-paper-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </Sheet.Trigger>
              )}
              {children}
            </div>
          </div>
        </Sheet.Content>
      </Sheet.View>
    </Sheet.Portal>
  );
}

// Silk's stacking values: the card underneath moves 10px back and shrinks a
// little from its far edge, and each card further down tucks in 2.5px more.
let stackOffset = ({ progress }: { progress: number }) =>
  progress <= 1 ? `${progress * -10}px` : `calc(-12.5px + 2.5px * ${progress})`;

let stackUp = {
  translateY: stackOffset,
  scale: [1, 0.933] as [number, number],
  transformOrigin: "50% 0",
};

let stackLeft = {
  translateX: stackOffset,
  scale: [1, 0.933] as [number, number],
  transformOrigin: "0 50%",
};
