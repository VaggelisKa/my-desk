import { cn } from "~/lib/utils";

// Kept apart from metrics.tsx so the skeleton that stands in while switching
// tabs doesn't pull the chart library into every page.

export function MetricsHeader() {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-[20px] font-bold tracking-tight sm:text-[22px]">
        Metrics
      </h1>
      <p className="max-w-[52ch] text-[14px] leading-relaxed text-ink-muted">
        How busy the office is. Bookings are counted at the end of each workday,
        so treat these as an estimate.
      </p>
    </header>
  );
}

export function MetricsSkeleton() {
  let block = "animate-pulse rounded-md bg-paper-muted";

  return (
    <div className="flex w-full flex-col gap-8 font-display text-ink">
      <MetricsHeader />
      <div aria-hidden className="flex flex-col gap-3">
        <div className={cn(block, "h-9 w-72 max-w-full")} />
        <div className={cn(block, "h-5 w-56")} />
      </div>
      <div aria-hidden className={cn(block, "h-[280px] rounded-xl")} />
      <div aria-hidden className={cn(block, "h-[380px] rounded-xl")} />
    </div>
  );
}
