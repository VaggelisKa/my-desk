import { CalendarDays, ChartLine, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation } from "react-router";
import { cn } from "~/lib/utils";

// The app chrome (design/design-options.html, "Masthead, in depth"): a 52px
// masthead from 768px up, a floating dock below that. Both are always in the
// DOM and CSS picks one, so there is no hydration flash. The avatar in the
// masthead and "You" in the dock open the same menu.

export type ShellUser = {
  id: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin" | null;
  desk?: { id: number; block: number; row: number; column: number } | null;
};

type Tab = "desks" | "bookings" | "metrics";

let TABS: {
  id: Tab;
  label: string;
  to: string;
  icon: typeof LayoutGrid;
  prefetch: "none" | "intent" | "render";
}[] = [
  { id: "desks", label: "Desks", to: "/", icon: LayoutGrid, prefetch: "none" },
  {
    id: "bookings",
    label: "Bookings",
    to: "/reservations",
    icon: CalendarDays,
    prefetch: "render",
  },
  {
    id: "metrics",
    label: "Metrics",
    to: "/metrics",
    icon: ChartLine,
    prefetch: "intent",
  },
];

let MENU_ID = "app-menu";

/** Secondary pages have no tab of their own; their parent tab stays lit. */
export function activeTab(pathname: string): Tab | undefined {
  if (pathname.startsWith("/metrics")) {
    return "metrics";
  }
  if (
    pathname.startsWith("/reservations") ||
    pathname.startsWith("/automatic-reservations")
  ) {
    return "bookings";
  }
  if (
    pathname === "/" ||
    pathname.startsWith("/desks/") ||
    pathname.startsWith("/reserve")
  ) {
    return "desks";
  }
  return undefined;
}

function initials(user: ShellUser) {
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
}

// Tapping the tab you are already on takes its page back to the top. Phones
// scroll inside the sheet stack outlet, desktop scrolls the window.
function scrollToTopIfActive(isActive: boolean) {
  return (event: MouseEvent) => {
    if (!isActive || event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }
    event.preventDefault();
    document
      .querySelector(".app-outlet")
      ?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
}

function Mark() {
  return (
    <span
      aria-hidden
      className="size-[18px] flex-none rounded-[5px] bg-moss shadow-[0_3px_0_var(--moss-edge)]"
    />
  );
}

function Avatar({ user, className }: { user: ShellUser; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[26px] flex-none place-items-center rounded-full bg-moss text-[11px] font-bold text-white",
        className,
      )}
    >
      {initials(user)}
    </span>
  );
}

// Remembers which control opened the menu, so the menu can sit under the
// avatar on desktop and above the dock on phones.
let menuSource: HTMLElement | null = null;

function rememberMenuSource(event: MouseEvent<HTMLElement>) {
  menuSource = event.currentTarget;
}

export function Masthead({ user }: { user: ShellUser }) {
  let { pathname } = useLocation();
  let active = activeTab(pathname);

  return (
    <header className="app-masthead sticky top-0 z-30 hidden h-[52px] border-b border-line bg-white/85 font-display text-ink backdrop-blur-md md:block">
      <div className="mx-auto flex h-full w-full max-w-3xl items-center gap-7 px-4">
        <Link
          to="/"
          prefetch="none"
          className="flex items-center gap-2.5 rounded-sm text-[15px] font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2"
        >
          <Mark />
          Share a desk
        </Link>

        <nav aria-label="Main" className="flex self-stretch">
          {TABS.map((tab) => {
            let isActive = tab.id === active;
            return (
              <Link
                key={tab.id}
                to={tab.to}
                prefetch={tab.prefetch}
                aria-current={isActive ? "page" : undefined}
                onClick={scrollToTopIfActive(isActive && pathname === tab.to)}
                className={cn(
                  "relative flex items-center px-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss",
                  isActive &&
                    "text-ink after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-t-sm after:bg-moss",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          popoverTarget={MENU_ID}
          onClick={rememberMenuSource}
          aria-label={`Account menu for ${user.firstName} ${user.lastName}`}
          className="ml-auto rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2"
        >
          <Avatar user={user} />
        </button>
      </div>
    </header>
  );
}

/**
 * The phone navigation: a dark pill floating above the bottom edge. It lives
 * outside the sheet stack outlet, because the outlet scrolls on phones and a
 * fixed element inside it would scroll away as soon as the depth effect
 * transforms the outlet. Sheets rise over it, and it hides while a text field
 * has focus so it never rides up on top of the keyboard.
 */
export function Dock({ user }: { user: ShellUser }) {
  let { pathname } = useLocation();
  let active = activeTab(pathname);
  let keyboardOpen = useTextFieldFocused();

  return (
    <nav
      aria-label="Main"
      data-hidden={keyboardOpen || undefined}
      className="app-dock fixed inset-x-0 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 font-display transition-[opacity,transform] duration-200 data-[hidden]:pointer-events-none data-[hidden]:translate-y-4 data-[hidden]:opacity-0 md:hidden"
    >
      <div className="flex items-center gap-0.5 rounded-full bg-[rgb(31_42_46/0.94)] p-[5px] shadow-[0_14px_30px_-10px_rgb(31_42_46/0.55),0_2px_6px_rgb(31_42_46/0.2)] ring-1 ring-white/10 backdrop-blur-md">
        {TABS.map((tab) => {
          let isActive = tab.id === active;
          let Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              to={tab.to}
              prefetch={tab.prefetch}
              aria-current={isActive ? "page" : undefined}
              onClick={scrollToTopIfActive(isActive && pathname === tab.to)}
              className={cn(
                "flex min-w-[64px] flex-col items-center gap-[3px] rounded-full px-3 pb-1.5 pt-2 text-[10.5px] font-semibold leading-none text-white/65 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss-soft",
                isActive && "bg-white/[0.14] text-white",
              )}
            >
              <Icon
                aria-hidden
                strokeWidth={2}
                className={cn("size-5", isActive && "text-moss-soft")}
              />
              {tab.label}
            </Link>
          );
        })}

        <button
          type="button"
          popoverTarget={MENU_ID}
          onClick={rememberMenuSource}
          className="flex min-w-[64px] flex-col items-center gap-[3px] rounded-full px-3 pb-1.5 pt-2 text-[10.5px] font-semibold leading-none text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss-soft"
        >
          <Avatar
            user={user}
            className="size-5 text-[8.5px] ring-1 ring-white/25"
          />
          You
        </button>
      </div>
    </nav>
  );
}

/**
 * Who you are and the account links. Built on the native Popover API, so
 * light dismiss, Escape and focus return come from the browser.
 */
export function AppMenu({ user }: { user: ShellUser }) {
  let menu = useRef<HTMLDivElement>(null);
  let { pathname } = useLocation();

  useEffect(() => {
    let element = menu.current;
    if (!element) {
      return;
    }

    function place(event: Event) {
      if ((event as ToggleEvent).newState !== "open" || !element) {
        return;
      }
      let source = menuSource?.getBoundingClientRect();
      let style = element.style;
      style.top = style.bottom = style.left = style.right = "auto";
      if (!source) {
        return;
      }
      if (source.top > window.innerHeight / 2) {
        // Opened from the dock: sit above it, centred.
        style.bottom = `${window.innerHeight - source.top + 14}px`;
        style.left = "50%";
        style.translate = "-50% 0";
      } else {
        style.top = `${source.bottom + 10}px`;
        style.right = `${Math.max(12, window.innerWidth - source.right)}px`;
        style.translate = "none";
      }
    }

    element.addEventListener("beforetoggle", place);
    return () => element.removeEventListener("beforetoggle", place);
  }, []);

  // Close after following a link from the menu.
  useEffect(() => {
    let element = menu.current;
    if (element?.matches(":popover-open")) {
      element.hidePopover();
    }
  }, [pathname]);

  let desk = user.desk
    ? `Desk ${user.desk.block}.${user.desk.row}.${user.desk.column}`
    : "No desk";
  let item =
    "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] text-ink hover:bg-paper-muted focus-visible:bg-paper-muted focus-visible:outline-none";

  return (
    <div
      ref={menu}
      id={MENU_ID}
      popover="auto"
      className="app-menu m-0 w-[232px] rounded-[10px] border border-line bg-paper p-1.5 font-display text-ink shadow-[0_12px_32px_-12px_rgb(0_0_0/0.3)]"
    >
      <div className="mb-1 border-b border-line px-2.5 pb-2.5 pt-2">
        <p className="text-[13px] font-bold">
          {user.firstName} {user.lastName}
        </p>
        <p className="text-xs text-ink-muted">
          {desk}
          {user.role === "admin" && " · admin"}
        </p>
      </div>

      {/* Until Bookings gets its Upcoming and Recurring segments, these two
      live here so they stay reachable without the sidebar. */}
      {user.desk && (
        <>
          <Link to="/reserve" prefetch="intent" className={item}>
            Add reservation
          </Link>
          <Link to="/automatic-reservations" prefetch="intent" className={item}>
            Automatic reservations
          </Link>
        </>
      )}
      <Link to={`/users/edit/${user.id}`} prefetch="intent" className={item}>
        Edit profile
      </Link>
      <a
        href="https://github.com/VaggelisKa/my-desk"
        target="_blank"
        rel="noreferrer noopener"
        className={item}
      >
        Source code <span aria-hidden>↗</span>
      </a>
      <a
        href="https://github.com/VaggelisKa/my-desk/issues/new"
        target="_blank"
        rel="noreferrer noopener"
        className={item}
      >
        Report a bug <span aria-hidden>↗</span>
      </a>

      <form
        method="POST"
        action="/login/logout"
        className="mt-1 border-t border-line pt-1"
      >
        <button type="submit" className={item}>
          Sign out
        </button>
      </form>
    </div>
  );
}

let TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "number",
  "password",
  "tel",
  "url",
  "date",
]);

function isTextField(target: EventTarget | null) {
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.has(target.type);
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

function useTextFieldFocused() {
  let [focused, setFocused] = useState(false);

  useEffect(() => {
    let onFocusIn = (event: FocusEvent) =>
      setFocused(isTextField(event.target));
    let onFocusOut = (event: FocusEvent) => {
      if (!isTextField(event.relatedTarget)) {
        setFocused(false);
      }
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return focused;
}

let PAGE_HEADINGS: {
  match: (pathname: string) => boolean;
  title: string;
  back?: { to: string; label: string };
}[] = [
  { match: (p) => p === "/reservations", title: "My reservations" },
  {
    match: (p) => p.startsWith("/automatic-reservations"),
    title: "Automatic reservations",
    back: { to: "/reservations", label: "Bookings" },
  },
  {
    match: (p) => p.startsWith("/reserve"),
    title: "Add reservation",
    back: { to: "/", label: "Desks" },
  },
  {
    match: (p) => p.startsWith("/desks/"),
    title: "Edit desk",
    back: { to: "/", label: "Desks" },
  },
  {
    match: (p) => p.startsWith("/users/edit/"),
    title: "Edit your profile",
    back: { to: "/", label: "Desks" },
  },
  { match: (p) => p.startsWith("/metrics"), title: "Metrics" },
];

/**
 * The breadcrumb bar used to be the only title on the pages that have not
 * been redesigned yet. This gives them a title (and a "← Desks" link on
 * secondary pages) until each one draws its own.
 */
export function PageHeading() {
  let { pathname } = useLocation();
  let heading = PAGE_HEADINGS.find((h) => h.match(pathname));

  if (!heading) {
    return null;
  }

  return (
    <div className="mb-6 flex w-full max-w-3xl flex-col gap-1.5 font-display text-ink">
      {heading.back && (
        <Link
          to={heading.back.to}
          prefetch="intent"
          aria-label={`Back to ${heading.back.label}`}
          className="self-start rounded-sm text-[13px] font-semibold text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss"
        >
          <span aria-hidden>← </span>
          {heading.back.label}
        </Link>
      )}
      <h1 className="text-[20px] font-bold tracking-tight sm:text-[22px]">
        {heading.title}
      </h1>
    </div>
  );
}
