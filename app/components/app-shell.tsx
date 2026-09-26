import {
  CalendarDays,
  ChartLine,
  createLucideIcon,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Link, useLocation, useNavigation } from "react-router";
import { activeTab, PAGE_COLUMN, type Tab } from "~/lib/app-shell";
import { cn, deskLabel } from "~/lib/utils";
import { SLIDE, useSlidingHighlight } from "./sliding-highlight";

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

// Lucide has no desk, so this one is drawn in its style: a screen on a desk.
let Desk = createLucideIcon("desk", [
  [
    "rect",
    { width: "12", height: "8", x: "6", y: "2", rx: "1.5", key: "screen" },
  ],
  ["path", { d: "M12 10v4", key: "stand" }],
  ["path", { d: "M2 14h20", key: "top" }],
  ["path", { d: "M4 14v7", key: "left-leg" }],
  ["path", { d: "M20 14v7", key: "right-leg" }],
]);

let TABS: {
  id: Tab;
  label: string;
  to: string;
  icon: LucideIcon;
  prefetch: "none" | "intent" | "render";
}[] = [
  { id: "desks", label: "Desks", to: "/", icon: Desk, prefetch: "none" },
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
  {
    id: "admin",
    label: "Admin",
    to: "/admin",
    icon: ShieldCheck,
    prefetch: "intent",
  },
];

/** Admin is only there for admins; the route checks the role as well. */
function tabsFor(user: ShellUser) {
  return TABS.filter((tab) => tab.id !== "admin" || user.role === "admin");
}

let MENU_ID = "app-menu";

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

/**
 * The tab to highlight follows the link you clicked straight away rather
 * than waiting for its page to load.
 */
function useActiveTab() {
  let { pathname } = useLocation();
  let navigation = useNavigation();
  return activeTab(navigation.location?.pathname ?? pathname);
}

function useSlidingIndicator() {
  let active = useActiveTab();
  return { active, ...useSlidingHighlight(active) };
}

export function Masthead({ user }: { user: ShellUser }) {
  let { pathname } = useLocation();
  let { active, position, animate, itemRef } = useSlidingIndicator();

  return (
    <header className="app-masthead sticky top-0 z-30 hidden h-[52px] border-b border-line bg-white/85 px-4 font-display text-ink backdrop-blur-md md:block">
      <div className={cn(PAGE_COLUMN, "flex h-full items-center")}>
        {/* No wordmark: the first tab's label lines up with the page title. */}
        <nav aria-label="Main" className="relative -ml-2.5 flex self-stretch">
          {position && (
            <span
              aria-hidden
              className={cn(
                "absolute -bottom-px left-0 h-0.5 rounded-t-sm bg-moss",
                animate && SLIDE,
              )}
              style={{
                // Inset by the tab's padding so the line spans the label.
                width: position.width - 20,
                transform: `translateX(${position.left + 10}px)`,
              }}
            />
          )}
          {tabsFor(user).map((tab) => {
            let isActive = tab.id === active;
            return (
              <Link
                key={tab.id}
                ref={itemRef(tab.id)}
                to={tab.to}
                prefetch={tab.prefetch}
                aria-current={isActive ? "page" : undefined}
                onClick={scrollToTopIfActive(isActive && pathname === tab.to)}
                className={cn(
                  "relative flex items-center px-2.5 text-[13px] font-semibold text-ink-muted transition-colors duration-300 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss",
                  isActive && "text-ink",
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
 * transforms the outlet. Sheets rise over it, and it hides while the keyboard
 * is up so it never rides up on top of it.
 */
export function Dock({ user }: { user: ShellUser }) {
  let { pathname } = useLocation();
  let active = useActiveTab();
  let keyboardOpen = useKeyboardOpen();
  let compact = useCompactOnScroll();
  let tabs = tabsFor(user);
  let activeIndex = tabs.findIndex((tab) => tab.id === active);

  // Every item has the same fixed width, so the pill's place follows from the
  // active item's index. That keeps it in step with the items while they
  // shrink and grow, which a measured position could only chase.
  let itemWidth = compact ? DOCK_ITEM.compact : DOCK_ITEM.full;

  return (
    <nav
      aria-label="Main"
      data-hidden={keyboardOpen || undefined}
      data-compact={compact || undefined}
      className="app-dock group/dock fixed inset-x-0 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 font-display transition-[opacity,transform] duration-200 data-[hidden]:pointer-events-none data-[hidden]:translate-y-4 data-[hidden]:opacity-0 md:hidden"
    >
      <div className="relative flex items-center gap-0.5 rounded-full bg-[rgb(31_42_46/0.8)] p-[5px] shadow-[0_14px_30px_-10px_rgb(31_42_46/0.55),0_2px_6px_rgb(31_42_46/0.2)] ring-1 ring-white/10 backdrop-blur-xl backdrop-saturate-150">
        {activeIndex >= 0 && (
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-[5px] left-[5px] rounded-full bg-white/[0.16]",
              SLIDE,
            )}
            style={{
              width: itemWidth,
              transform: `translateX(${activeIndex * (itemWidth + DOCK_GAP)}px)`,
            }}
          />
        )}

        {tabs.map((tab) => {
          let isActive = tab.id === active;
          let Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              to={tab.to}
              prefetch={tab.prefetch}
              aria-current={isActive ? "page" : undefined}
              onClick={scrollToTopIfActive(isActive && pathname === tab.to)}
              style={{ width: itemWidth }}
              className={cn(
                DOCK_ITEM.className,
                "transition-[width,padding,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss-soft",
                isActive && "text-white",
              )}
            >
              <Icon
                aria-hidden
                strokeWidth={2}
                className={cn(
                  "size-5 transition-[transform,color] duration-500 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none",
                  isActive && "-translate-y-px scale-110 text-moss-soft",
                )}
              />
              <DockLabel>{tab.label}</DockLabel>
            </Link>
          );
        })}

        <button
          type="button"
          popoverTarget={MENU_ID}
          onClick={rememberMenuSource}
          style={{ width: itemWidth }}
          className={cn(
            DOCK_ITEM.className,
            "transition-[width,padding,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss-soft",
          )}
        >
          <Avatar
            user={user}
            className="size-5 text-[8.5px] ring-1 ring-white/25"
          />
          <DockLabel>You</DockLabel>
        </button>
      </div>
    </nav>
  );
}

// Fits the longest label ("Bookings") and five items on a 375px phone.
let DOCK_ITEM = {
  full: 64,
  compact: 44,
  className:
    "group relative flex flex-none flex-col items-center rounded-full pb-1.5 pt-2 text-[10.5px] font-semibold leading-none text-white/60 duration-500 [transition-timing-function:cubic-bezier(0.34,1.36,0.64,1)] active:scale-95 motion-reduce:transition-none group-data-[compact]/dock:py-2.5",
};
let DOCK_GAP = 2;

/**
 * Folds away to nothing when the dock is compact. The text stays in the
 * accessibility tree, so each item keeps its name.
 */
function DockLabel({ children }: { children: string }) {
  return (
    <span className="grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-500 [transition-timing-function:cubic-bezier(0.34,1.36,0.64,1)] group-data-[compact]/dock:grid-rows-[0fr] group-data-[compact]/dock:opacity-0 motion-reduce:transition-none">
      <span className="overflow-hidden pt-[3px]">{children}</span>
    </span>
  );
}

/**
 * Scrolling down a page tucks the dock into icons only, to give the page
 * more room; scrolling back up, reaching the top or opening another page
 * brings the labels back. Only phones show the dock, and there the page
 * scrolls inside the outlet rather than the window.
 */
function useCompactOnScroll() {
  let { pathname } = useLocation();
  let [compact, setCompact] = useState(false);

  useEffect(() => {
    setCompact(false);
    let outlet = document.querySelector<HTMLElement>(".app-outlet");
    if (!outlet) return;
    let scroller = outlet;

    let last = scroller.scrollTop;
    function onScroll() {
      // Clamped, so the rubber band at either end reads as standing still.
      let max = scroller.scrollHeight - scroller.clientHeight;
      let y = Math.min(Math.max(scroller.scrollTop, 0), max);
      let delta = y - last;
      if (y < 24) {
        setCompact(false);
      } else if (Math.abs(delta) < 8) {
        // Too small to call a direction; wait for more.
        return;
      } else {
        setCompact(delta > 0);
      }
      last = y;
    }

    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [pathname]);

  return compact;
}

/**
 * Who you are and the account links. Built on the native Popover API, so
 * light dismiss, Escape and focus return come from the browser.
 */
export function AppMenu({ user }: { user: ShellUser }) {
  let menu = useRef<HTMLElement>(null);
  let location = useLocation();

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
  }, [location.key]);

  let desk = user.desk ? `Desk ${deskLabel(user.desk)}` : "No desk";
  let item =
    "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] text-ink hover:bg-paper-muted focus-visible:bg-paper-muted focus-visible:outline-none";

  return (
    <nav
      ref={menu}
      id={MENU_ID}
      popover="auto"
      aria-label="Account"
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
    </nav>
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
  let { key } = useLocation();
  let [focused, setFocused] = useState(false);

  // Safari sends no focusout when the focused field is removed with its page,
  // as on Back, which would leave the dock hidden. So check again whenever
  // the page changes.
  useEffect(() => {
    setFocused(isTextField(document.activeElement));
  }, [key]);

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

// A phone keyboard is far taller than the browser bars folding away.
let KEYBOARD_MIN_HEIGHT = 150;
// How long a focused field may wait for its keyboard before the dock returns.
let KEYBOARD_WAIT_MS = 1000;

/**
 * Whether the on-screen keyboard is up. A focused text field alone can't say:
 * phones close the keyboard without taking focus from the field (the keyboard
 * button, clearing a search, a sheet handing focus back), which left the dock
 * hidden. So the dock hides as soon as a field gets focus, and after that
 * follows the visual viewport, which shrinks by the keyboard's height.
 */
function useKeyboardOpen() {
  let focused = useTextFieldFocused();
  // Set once the keyboard is known to be down while a field keeps focus.
  let [closed, setClosed] = useState(false);
  let shrunk = useRef(false);
  let focusedRef = useRef(focused);
  useLayoutEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  useEffect(() => {
    let viewport = window.visualViewport;
    if (!viewport) return;

    // The tallest the viewport has been at this width, keyboard down.
    let width = window.innerWidth;
    let tallest = 0;
    let measure = () => {
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        tallest = 0;
      }
      let height = viewport.height * viewport.scale;
      tallest = Math.max(tallest, height);
      let wasShrunk = shrunk.current;
      shrunk.current = tallest - height > KEYBOARD_MIN_HEIGHT;
      if (shrunk.current) setClosed(false);
      else if (wasShrunk && focusedRef.current) setClosed(true);
    };

    measure();
    viewport.addEventListener("resize", measure);
    return () => viewport.removeEventListener("resize", measure);
  }, []);

  // Hide right away on focus rather than once the keyboard has slid in, but
  // don't wait forever for a keyboard that never comes.
  useEffect(() => {
    if (!focused) {
      setClosed(false);
      return;
    }
    if (!window.visualViewport) return;
    let timer = setTimeout(() => {
      if (!shrunk.current) setClosed(true);
    }, KEYBOARD_WAIT_MS);
    return () => clearTimeout(timer);
  }, [focused]);

  return focused && !closed;
}
