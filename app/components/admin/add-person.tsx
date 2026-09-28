import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useAdminFetcher, type AdminData } from "~/components/admin/shared";
import { AdminSheet } from "~/components/admin/sheets";
import { Button } from "~/components/ui/button";
import { cn, deskLabel } from "~/lib/utils";

// Admin › People: adds someone who has not signed up yet, with the same
// checks as guest sign-up, and an unclaimed desk if they get one straight away.

export function AddPerson({ data }: { data: AdminData }) {
  let free = data.desks.filter((desk) => !desk.owner);

  return (
    <AdminSheet
      trigger={
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
      }
      title="Add person"
      description="They sign in with their user ID."
      rows={(_open, close) => <AddPersonForm free={free} onDone={close} />}
    />
  );
}

let input =
  "h-11 w-full rounded-[10px] border border-field bg-paper px-3 text-base text-ink placeholder:text-ink-muted focus-visible:border-moss focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-moss aria-[invalid]:border-danger";

function AddPersonForm({
  free,
  onDone,
}: {
  free: AdminData["desks"];
  onDone: () => void;
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
        {(props) => (
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
            className={cn(input, "uppercase placeholder:normal-case")}
          />
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
      <Button
        type="submit"
        variant="primary"
        size="tall"
        disabled={busy}
        className="mt-1"
      >
        {busy ? "Adding..." : "Add person"}
      </Button>
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
