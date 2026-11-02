import { AutoFocusTarget } from "@silk-hq/components";
import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { Field, FormSheet, Select } from "~/components/admin/form-sheet";
import { fieldInput } from "~/components/admin/helpers";
import { useAdminFetcher, type AdminData } from "~/components/admin/shared";
import { Button } from "~/components/ui/button";
import { cn, deskLabel } from "~/lib/utils";

// Admin › People: adds someone who has not signed up yet, with the same
// checks as guest sign-up, and an unclaimed desk if they get one straight away.

export function AddPerson({ data }: { data: AdminData }) {
  let free = data.desks.filter((desk) => !desk.owner);

  return (
    <FormSheet
      title="Add person"
      description="They sign in with their user ID."
      intent="add-person"
      submit={{ label: "Add", busy: "Adding..." }}
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
    >
      {({ id, close, ownSubmit }) => (
        <AddPersonForm id={id} free={free} onDone={close} submit={ownSubmit} />
      )}
    </FormSheet>
  );
}

function AddPersonForm({
  id,
  free,
  onDone,
  submit,
}: {
  id: string;
  free: AdminData["desks"];
  onDone: () => void;
  /** Ends in its own Add button; phones have theirs in the header. */
  submit?: boolean;
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
      id={id}
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
        {/* Focused as the sheet opens, which brings up the phone's keyboard. */}
        {(props) => (
          <AutoFocusTarget.Root asChild timing="present">
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
              enterKeyHint="next"
              className={cn(fieldInput, "uppercase placeholder:normal-case")}
            />
          </AutoFocusTarget.Root>
        )}
      </Field>
      <Field label="First name" error={errors?.firstName}>
        {(props) => (
          <input
            {...props}
            name="firstName"
            required
            autoComplete="off"
            className={fieldInput}
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
            className={fieldInput}
          />
        )}
      </Field>
      {free.length > 0 && (
        <Field label="Desk" error={errors?.deskId}>
          {(props) => (
            <Select {...props} name="deskId" defaultValue="">
              <option value="">No desk</option>
              {free.map((desk) => (
                <option key={desk.id} value={desk.id}>
                  Desk {deskLabel(desk)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {submit && (
        <Button
          type="submit"
          variant="primary"
          size="tall"
          disabled={busy}
          className="mt-1"
        >
          {busy ? "Adding..." : "Add person"}
        </Button>
      )}
    </fetcher.Form>
  );
}
