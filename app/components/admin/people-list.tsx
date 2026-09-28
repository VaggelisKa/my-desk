import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AddPerson } from "~/components/admin/add-person";
import { BookingSection } from "~/components/admin/bookings-by-day";
import {
  bookedDays,
  fullName,
  matches,
  rowButton,
  rowClass,
} from "~/components/admin/helpers";
import { MoveConfirm, UnassignConfirm } from "~/components/admin/moves";
import {
  type AdminData,
  Badge,
  BookedCount,
  Dash,
  type Index,
  listClass,
  NothingFound,
  SearchField,
  SortHeader,
  stretched,
  tableRow,
  tableWrap,
  td,
  th,
  useAdminFetcher,
  useIndex,
  useSort,
} from "~/components/admin/shared";
import {
  type Action,
  AdminSheet,
  ConfirmStep,
  SettingsAction,
  SettingsList,
  SettingsRow,
  useSteps,
} from "~/components/admin/sheets";
import { DeskChip } from "~/components/desk-chip";
import { Button } from "~/components/ui/button";
import type { AdminDesk, AdminPerson } from "~/lib/admin.server";
import { capitalize, cn, deskLabel, deskPlace, plural } from "~/lib/utils";

// Admin › People: everyone, their desk, role and weekly booking.

export function PeopleList({ data }: { data: AdminData }) {
  let index = useIndex(data);
  let [query, setQuery] = useState("");
  let shown = data.people.filter((person) => {
    let desk = person.deskId !== null ? index.desks.get(person.deskId) : null;
    return matches(query, fullName(person), person.id, desk && deskLabel(desk));
  });

  let deskOf = (person: AdminPerson) =>
    person.deskId !== null ? index.desks.get(person.deskId) : undefined;
  let table = useSort(
    shown,
    {
      name: { value: (p) => fullName(p) },
      id: { value: (p) => p.id },
      desk: {
        value: (p) => {
          let desk = deskOf(p);
          return desk
            ? desk.block * 10000 + desk.row * 100 + desk.column
            : null;
        },
      },
      weekly: { value: (p) => (p.hasRecurring ? 0 : null) },
      booked: {
        value: (p) => index.bookingsOfPerson(p.id).length,
        first: "desc",
      },
    },
    "name",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchField
            id="admin-people-search"
            label="Search name, ID or desk"
            value={query}
            onChange={setQuery}
            results={`${shown.length} ${shown.length === 1 ? "person" : "people"}`}
          />
        </div>
        <AddPerson data={data} />
      </div>

      {shown.length === 0 ? (
        <NothingFound>Nobody matches “{query.trim()}”.</NothingFound>
      ) : (
        <ul className={cn(listClass, "md:hidden")}>
          {shown.map((person) => {
            let desk =
              person.deskId !== null ? index.desks.get(person.deskId) : null;
            return (
              <li
                key={person.id}
                className="border-b border-line last:border-b-0"
              >
                <PersonSheet person={person} data={data} index={index}>
                  <button type="button" className={cn(rowClass, "border-b-0")}>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-sm font-semibold leading-tight">
                        <span className="truncate capitalize">
                          {fullName(person)}
                        </span>
                        {person.role === "admin" && <Badge>Admin</Badge>}
                      </span>
                      <span className="truncate text-xs leading-tight text-ink-muted">
                        {person.id} ·{" "}
                        {desk ? `Desk ${deskLabel(desk)}` : "No desk"}
                      </span>
                    </span>
                    <BookedCount
                      count={index.bookingsOfPerson(person.id).length}
                    />
                  </button>
                </PersonSheet>
              </li>
            );
          })}
        </ul>
      )}

      {shown.length > 0 && (
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <SortHeader
                  label="Name"
                  column="name"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="ID"
                  column="id"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="Desk"
                  column="desk"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="Weekly"
                  column="weekly"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="Booked"
                  column="booked"
                  sort={table.sort}
                  onSort={table.toggle}
                  align="right"
                />
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {table.sorted.map((person) => {
                let desk =
                  person.deskId !== null
                    ? index.desks.get(person.deskId)
                    : null;
                return (
                  <tr key={person.id} className={tableRow}>
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold capitalize">
                          {fullName(person)}
                        </span>
                        {person.role === "admin" && <Badge>Admin</Badge>}
                      </span>
                    </td>
                    <td className={cn(td, "text-ink-muted")}>{person.id}</td>
                    <td className={td}>
                      {desk ? (
                        deskLabel(desk)
                      ) : (
                        <span className="text-ink-muted">No desk</span>
                      )}
                    </td>
                    <td className={cn(td, "text-ink-muted")}>
                      {person.hasRecurring ? "Set up" : <Dash spoken="Off" />}
                    </td>
                    <td className={cn(td, "text-right")}>
                      <BookedCount
                        count={index.bookingsOfPerson(person.id).length}
                        short
                      />
                    </td>
                    <td className={cn(td, "w-px whitespace-nowrap pr-2")}>
                      <PersonSheet
                        person={person}
                        data={data}
                        index={index}
                        menu
                      >
                        <button
                          type="button"
                          aria-label={`${fullName(person)}, manage`}
                          className={cn(rowButton, stretched)}
                        >
                          Manage
                        </button>
                      </PersonSheet>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PersonSheet({
  person,
  data,
  index,
  menu,
  children,
}: {
  person: AdminPerson;
  data: AdminData;
  index: Index;
  /** Opens a menu of actions instead, each with a sheet of its own. */
  menu?: boolean;
  children: ReactNode;
}) {
  let desk = person.deskId !== null ? index.desks.get(person.deskId) : null;
  let isMe = person.id === data.me;
  let isAdmin = person.role === "admin";
  let bookings = index.bookingsOfPerson(person.id);
  let name = fullName(person);
  let first = capitalize(person.firstName);
  let actions: Action[] = [
    { sub: "desk", label: desk ? "Move to another desk" : "Give a desk" },
    { sub: "name", label: "Rename" },
  ];
  // Quick ones run straight from the menu; the rest open a sheet.
  if (!isMe) {
    actions.push({
      label: isAdmin ? "Remove admin role" : "Make admin",
      run: {
        intent: "set-role",
        userId: person.id,
        role: isAdmin ? "user" : "admin",
      },
    });
  }
  actions.push({ sub: "bookings", label: "Upcoming bookings" });
  if (person.hasRecurring) {
    actions.push({
      label: "Stop weekly booking",
      danger: true,
      run: { intent: "stop-recurring", userId: person.id },
    });
  }
  if (desk) {
    actions.push({
      sub: "unassign",
      label: "Unassign desk",
      danger: true,
    });
  }

  return (
    <AdminSheet
      trigger={children}
      menu={menu ? { label: capitalize(name), actions } : undefined}
      title={name}
      titleClassName="capitalize"
      description={[
        person.id,
        desk ? `Desk ${deskLabel(desk)}` : "No desk",
        isAdmin && "Admin",
      ]
        .filter(Boolean)
        .join(" · ")}
      rows={(open) => (
        <>
          <SettingsList>
            <SettingsRow
              label="Desk"
              value={desk ? deskLabel(desk) : "None"}
              onClick={() => open("desk")}
            />
            <SettingsRow
              label="Name"
              value={name}
              valueClassName="capitalize"
              onClick={() => open("name")}
            />
            <SettingsRow
              label="Role"
              value={isAdmin ? "Admin" : "Member"}
              // You can't take the role from yourself: another admin can.
              onClick={isMe ? undefined : () => open("role")}
            />
          </SettingsList>
          <SettingsList title="Bookings">
            <SettingsRow
              label="Upcoming"
              value={bookedDays(bookings.length)}
              onClick={() => open("bookings")}
            />
            <SettingsRow
              label="Weekly booking"
              value={person.hasRecurring ? "Set up" : "Off"}
              // Only its owner can set one up, so off has nothing to open.
              onClick={person.hasRecurring ? () => open("weekly") : undefined}
            />
          </SettingsList>
          {desk && (
            <SettingsList>
              <SettingsAction
                label="Unassign desk"
                onClick={() => open("unassign")}
              />
            </SettingsList>
          )}
        </>
      )}
      page={(sub, close) => {
        let description = capitalize(name);
        switch (sub) {
          case "unassign":
            return {
              title: "Unassign desk",
              description,
              body: (
                <UnassignConfirm desk={desk} index={index} onDone={close} />
              ),
            };
          case "desk":
            return {
              title: desk ? "Move to another desk" : "Give a desk",
              description,
              body: (
                <DeskChoice
                  person={person}
                  desk={desk}
                  data={data}
                  index={index}
                  onDone={close}
                />
              ),
            };
          case "name":
            return {
              title: "Name",
              description,
              body: <RenameForm person={person} onDone={close} />,
            };
          case "role":
            return {
              title: "Role",
              description,
              body: <RoleChoice person={person} onDone={close} />,
            };
          case "weekly":
            return {
              title: "Weekly booking",
              description,
              body: (
                <>
                  <p className="text-[15px] leading-snug text-ink">
                    Books {desk ? `desk ${deskLabel(desk)}` : "their desk"} on
                    the same days every week. If you stop it, the days it
                    already booked stay booked.
                  </p>
                  <ConfirmStep
                    confirmLabel="Stop weekly booking"
                    fields={{ intent: "stop-recurring", userId: person.id }}
                    onDone={close}
                  />
                </>
              ),
            };
        }
        return {
          title: "Upcoming bookings",
          description,
          body: (
            <BookingSection
              bookings={bookings}
              index={index}
              show="desk"
              clearFields={{ intent: "clear-person", userId: person.id }}
              empty={`${first} has nothing booked from today on.`}
            />
          ),
        };
      }}
    />
  );
}

/** Picks the person's new desk, then says what that changes. */
function DeskChoice({
  person,
  desk,
  data,
  index,
  onDone,
}: {
  person: AdminPerson;
  desk: AdminDesk | null | undefined;
  data: AdminData;
  index: Index;
  onDone: () => void;
}) {
  let [step, go, frame, key] = useSteps<{ desk?: AdminDesk }>({});

  return (
    <div key={key} {...frame}>
      {step.desk ? (
        <MoveConfirm
          desk={step.desk}
          person={person}
          index={index}
          onBack={() => go({})}
          onDone={onDone}
        />
      ) : (
        <DeskPicker
          data={data}
          exclude={desk?.id}
          onPick={(picked) => go({ desk: picked })}
        />
      )}
    </div>
  );
}

function RoleChoice({
  person,
  onDone,
}: {
  person: AdminPerson;
  onDone: () => void;
}) {
  let [picked, setPicked] = useState(() => person.role);
  let first = capitalize(person.firstName);
  let roles = [
    { role: "user", label: "Member", hint: "Books desks" },
    { role: "admin", label: "Admin", hint: "Also has this Admin tab" },
  ] as const;

  return (
    <>
      <ul className={listClass} aria-label="Role">
        {roles.map(({ role, label, hint }) => (
          <li key={role} className="border-b border-line last:border-b-0">
            <button
              type="button"
              aria-pressed={picked === role}
              onClick={() => setPicked(role)}
              className={cn(rowClass, "border-b-0")}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-medium">{label}</span>
                <span className="text-xs text-ink-muted">{hint}</span>
              </span>
              {picked === role && (
                <Check aria-hidden="true" className="size-4 text-moss-edge" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {picked !== person.role && (
        <ConfirmStep
          question={
            picked === "admin"
              ? `${first} gets this Admin tab and can change any desk or booking.`
              : `${first} loses the Admin tab.`
          }
          confirmLabel={picked === "admin" ? "Make admin" : "Remove admin role"}
          tone={picked === "admin" ? "primary" : "danger"}
          fields={{ intent: "set-role", userId: person.id, role: picked }}
          onDone={onDone}
        />
      )}
    </>
  );
}

function DeskPicker({
  data,
  exclude,
  onPick,
}: {
  data: AdminData;
  exclude?: number;
  onPick: (desk: AdminDesk) => void;
}) {
  let [query, setQuery] = useState("");
  // Free desks first: that is usually what you are looking for.
  let desks = data.desks
    .filter((d) => d.id !== exclude)
    .filter((d) => matches(query, deskLabel(d), d.owner && fullName(d.owner)))
    .sort((a, b) => Number(!!a.owner) - Number(!!b.owner));

  return (
    <div className="flex flex-col gap-3">
      <SearchField
        id="admin-desk-picker"
        label="Search desk or owner"
        value={query}
        onChange={setQuery}
        results={plural(desks.length, "desk")}
      />
      <ul className={listClass}>
        {desks.map((desk) => (
          <li key={desk.id} className="border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => onPick(desk)}
              className={cn(rowClass, "border-b-0 px-3.5 py-2.5 sm:px-3.5")}
            >
              <DeskChip
                label={deskLabel(desk)}
                tone={desk.owner ? "taken" : "free"}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold capitalize leading-tight">
                  {desk.owner ? fullName(desk.owner) : "Unclaimed"}
                  <span className="sr-only">{`, desk ${deskLabel(desk)}`}</span>
                </span>
                <span className="truncate text-xs leading-tight text-ink-muted">
                  {deskPlace(desk, { short: true })}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="text-[13px] font-semibold text-moss-edge"
              >
                Pick
              </span>
            </button>
          </li>
        ))}
        {desks.length === 0 && (
          <li className="px-4 py-5 text-sm text-ink-muted">No desk matches.</li>
        )}
      </ul>
    </div>
  );
}

function RenameForm({
  person,
  onDone,
}: {
  person: AdminPerson;
  onDone: () => void;
}) {
  let fetcher = useAdminFetcher(onDone);
  let [firstName, setFirstName] = useState(() => person.firstName);
  let [lastName, setLastName] = useState(() => person.lastName);
  let busy = fetcher.state !== "idle";

  let changed =
    firstName.trim() !== person.firstName ||
    lastName.trim() !== person.lastName;
  let input =
    "h-11 w-full rounded-[10px] border border-field bg-paper px-3 text-base text-ink focus-visible:border-moss focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-moss";

  return (
    <fetcher.Form
      method="post"
      action="/admin"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void fetcher.submit(event.currentTarget);
      }}
    >
      <input type="hidden" name="intent" value="rename" />
      <input type="hidden" name="userId" value={person.id} />
      <label className="grid gap-1.5 text-[13px] text-ink-muted">
        First name
        <input
          name="firstName"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          autoComplete="off"
          className={input}
        />
      </label>
      <label className="grid gap-1.5 text-[13px] text-ink-muted">
        Last name
        <input
          name="lastName"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          autoComplete="off"
          className={input}
        />
      </label>
      <Button
        type="submit"
        variant="primary"
        size="tall"
        disabled={!changed || busy}
      >
        {busy ? "Saving..." : "Save name"}
      </Button>
    </fetcher.Form>
  );
}

/* ------------------------------------------------------------------ */
/* Bookings                                                           */
/* ------------------------------------------------------------------ */
