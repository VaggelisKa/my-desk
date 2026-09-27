import { cn } from "~/lib/utils";

/** The desk as a small slab, the same shapes and colours as the map. */
export function DeskChip({
  label,
  tone,
}: {
  label: string;
  tone: "mine" | "taken" | "free";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid h-8 min-w-[48px] shrink-0 place-items-center rounded border-[1.5px] px-1.5 text-[11px] font-bold tracking-[0.03em]",
        tone === "mine" &&
          "border-moss-edge bg-moss text-white shadow-[0_3px_0_var(--moss-edge)]",
        tone === "taken" &&
          "border-ink bg-taken text-white shadow-[0_3px_0_var(--ink)]",
        tone === "free" &&
          "border-ink bg-paper text-ink shadow-[0_3px_0_var(--ink)]",
      )}
    >
      {label}
    </span>
  );
}
