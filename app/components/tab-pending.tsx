import { format } from "date-fns";
import { useLocation, useNavigation, useSearchParams } from "react-router";
import { AdminHeader } from "~/components/admin";
import { BookingsHeader } from "~/components/bookings";
import { DayStrip, DeskFilters } from "~/components/desk-filters";
import { MetricsSkeleton } from "~/components/metrics-skeleton";
import { Skeleton } from "~/components/ui/skeleton";
import { Wall } from "~/components/wall";
import { activeTab, type Tab } from "~/lib/app-shell";
import { defaultDay, formatDate, officeNow } from "~/lib/dates";
import { cn } from "~/lib/utils";

/**
 * The tab a navigation is heading to, while it loads, when that is not the
 * tab you are on. Moving within a tab (filters, days, Upcoming · Recurring)
 * and form submissions keep the page up as before.
 */
export function usePendingTab() {
  let location = useLocation();
  let navigation = useNavigation();

  if (
    navigation.state !== "loading" ||
    navigation.formMethod ||
    !navigation.location
  ) {
    return undefined;
  }

  let target = activeTab(navigation.location.pathname);
  return target !== activeTab(location.pathname) ? target : undefined;
}

/**
 * What a tab looks like before its data arrives. The shell swaps it in the
 * moment you tap another tab, so the switch feels instant like a native app
 * instead of waiting on the server with the old page still up. Each one draws
 * the page's real heading so nothing moves when the content lands.
 */
export function TabPending({
  tab,
  hasDesk,
}: {
  tab: Tab;
  /** Bookings only shows its Upcoming · Recurring switch with a desk. */
  hasDesk: boolean;
}) {
  switch (tab) {
    case "desks":
      return <DesksPending />;
    case "bookings":
      return (
        <section className="flex w-full flex-col gap-8 font-display text-ink">
          <BookingsHeader desk={hasDesk ? PLACEHOLDER_DESK : null} />
          <ListSkeleton />
        </section>
      );
    case "metrics":
      return <MetricsSkeleton />;
    case "admin":
      return (
        <section className="flex w-full flex-col gap-6 font-display text-ink">
          <AdminHeader />
          <ListSkeleton />
        </section>
      );
  }
}

// BookingsHeader only checks whether there is a desk.
let PLACEHOLDER_DESK = { id: 0, block: 0, row: 0, column: 0 };

function DesksPending() {
  let now = officeNow();

  return (
    <section className="flex w-full max-w-3xl flex-col gap-5 font-display text-ink">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[20px] font-bold tracking-tight sm:text-[22px]">
            Desks
          </h1>
          <p className="text-sm text-ink-muted">
            {format(defaultDay(now), "EEE d MMM")}
          </p>
        </div>

        <DayStrip today={formatDate(now)} />
        <DeskFilters />
      </header>

      <Legend />
      <DesksSkeleton />
    </section>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2.5">
      <Skeleton className="ml-1 h-4 w-40" />
      <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-paper">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:px-5"
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend() {
  let swatch = "inline-block h-[9px] w-[14px] rounded-[2px] border";

  return (
    <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(swatch, "border-ink bg-paper")} /> Free
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(swatch, "border-ink bg-taken")} /> Taken
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(swatch, "border-moss-edge bg-moss")} /> Yours
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(swatch, "border-line bg-paper")} /> Unclaimed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(swatch, "border-dashed border-dim bg-transparent")} />{" "}
        Filtered out
      </span>
    </div>
  );
}

// Mirrors the office floor plan on the Desks page: blocks 1-7 in a 3x2 grid, block 4
// is a single row, and a wall sits above block 7.
const skeletonBlocks = ["1", "2", "3", "4", "5", "6", "7"];

export function DesksSkeleton() {
  let [searchParams] = useSearchParams();
  let blockFilter = searchParams.get("block");
  let blocks =
    blockFilter === null || blockFilter === "all"
      ? skeletonBlocks
      : skeletonBlocks.filter((block) => block === blockFilter);

  return (
    <div className="max-w-[420px] pl-[26px] pr-[22px] sm:pl-8 sm:pr-7">
      {blocks.map((block) => {
        let singleRow = block === "4";

        return (
          <div key={block} className="flex flex-col [&+&]:pt-5">
            {block === "7" && <Wall />}

            <div className="mt-2 text-[13px] font-bold">Block {block}</div>
            <div
              className={cn(
                "grid grid-cols-3 gap-x-2.5 gap-y-[22px] pb-3 pt-5 sm:gap-y-[26px] sm:pb-3.5 sm:pt-6",
                singleRow ? "grid-rows-1" : "grid-rows-2",
              )}
            >
              {Array.from({ length: singleRow ? 3 : 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded sm:h-[50px]" />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
