import { cn } from "~/lib/utils";

/** The wall that separates block 7 from the rest, drawn as a low slab. */
export function Wall({ className }: { className?: string }) {
  return (
    <div
      className={cn("relative mb-3.5 mt-6 font-display", className)}
      aria-hidden="true"
    >
      <span className="absolute -top-5 right-0 text-[11px] font-bold text-ink-muted">
        Wall
      </span>
      <div className="h-2.5 rounded-[3px] border-[1.5px] border-ink bg-paper-muted shadow-[0_8px_0_var(--ink)]" />
    </div>
  );
}
