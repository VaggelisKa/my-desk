import { TriangleAlertIcon } from "lucide-react";
import { Link } from "react-router";
import { cn } from "~/lib/utils";

/**
 * Something failed to load. Inside a page (the desk map, the metrics) it is
 * a card under the page's own heading; as the error page (`page`) it brings
 * its own h1 and a way back.
 */
export function ErrorCard({
  message,
  page = false,
}: {
  message?: string;
  page?: boolean;
}) {
  let Heading: "h1" | "h2" = page ? "h1" : "h2";

  return (
    <div
      role={page ? undefined : "alert"}
      className={cn(
        "enter flex w-full items-start gap-3.5 rounded-xl border border-line bg-paper px-5 py-6 font-display text-ink sm:px-6",
        page && "max-w-lg",
      )}
    >
      <span
        aria-hidden="true"
        className="bg-danger/10 grid size-9 shrink-0 place-items-center rounded-full text-danger"
      >
        <TriangleAlertIcon className="size-[18px]" strokeWidth={2.25} />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Heading
          className={cn(
            "font-bold tracking-tight",
            page ? "text-[20px] sm:text-[22px]" : "text-[15px]",
          )}
        >
          Something went wrong
        </Heading>
        <p className="text-pretty text-sm leading-relaxed text-ink-muted">
          {message || "Something went wrong. Please try again later."}
        </p>
        {page && (
          <Link
            to="/"
            className="mt-2 self-start rounded-sm text-sm font-semibold text-ink underline decoration-ink-muted underline-offset-4 hover:decoration-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2"
          >
            Back to Desks
          </Link>
        )}
      </div>
    </div>
  );
}
