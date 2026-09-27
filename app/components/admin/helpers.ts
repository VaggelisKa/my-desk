import { cn, plural } from "~/lib/utils";

// Plain helpers and class names the Admin lists and sheets share. They live
// apart from the components so those files only export components.

export let focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2";

export function fullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`.trim();
}

export function matches(
  query: string,
  ...values: (string | null | undefined)[]
) {
  let q = query.trim().toLowerCase();
  return !q || values.some((value) => value?.toLowerCase().includes(q));
}

export let rowClass = cn(
  "flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-paper-muted sm:px-5",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss",
);

export let rowButton = cn(
  "inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-semibold text-ink-muted hover:text-ink",
  focusRing,
);

export function bookedDays(count: number) {
  return count ? plural(count, "day") : "None";
}
