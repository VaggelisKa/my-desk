import { type ReactNode, useState } from "react";
import { BookingSection } from "~/components/admin/bookings-by-day";
import { MoveConfirm, UnassignConfirm } from "~/components/admin/moves";
import {
  type AdminData,
  BookedCount,
  bookedDays,
  fullName,
  groupHeading,
  type Index,
  listClass,
  matches,
  NothingFound,
  rowButton,
  rowClass,
  SearchField,
  SortHeader,
  stretched,
  tableRow,
  tableWrap,
  td,
  th,
  useIndex,
  useSort,
} from "~/components/admin/shared";
import {
  type Action,
  AdminSheet,
  SettingsAction,
  SettingsList,
  SettingsRow,
  useSteps,
} from "~/components/admin/sheets";
import { DeskChip } from "~/components/desk-chip";
import type { AdminDesk, AdminPerson } from "~/lib/admin.server";
import { cn, deskLabel, deskPlace, plural } from "~/lib/utils";

// Admin › Desks: every desk with its owner and bookings.

export function DeskList({ data }: { data: AdminData }) {
  let index = useIndex(data);
  let [query, setQuery] = useState("");
  let shown = data.desks.filter((desk) =>
    matches(
      query,
      deskLabel(desk),
      desk.owner && fullName(desk.owner),
      desk.owner?.id,
      desk.owner ? null : "unclaimed",
    ),
  );
  let blocks = [...new Set(shown.map((desk) => desk.block))];
  let table = useSort(
    shown,
    {
      desk: { value: (d) => d.block * 10000 + d.row * 100 + d.column },
      owner: { value: (d) => (d.owner ? fullName(d.owner) : null) },
      // Window, middle, aisle, then by block.
      place: { value: (d) => d.column * 100 + d.block },
      booked: {
        value: (d) => index.bookingsOfDesk(d.id).length,
        first: "desc",
      },
    },
    "desk",
  );

  return (
    <div className="flex flex-col gap-6">
      <SearchField
        id="admin-desk-search"
        label="Search desk or person"
        value={query}
        onChange={setQuery}
        results={plural(shown.length, "desk")}
      />

      {blocks.length === 0 && (
        <NothingFound>No desk matches “{query.trim()}”.</NothingFound>
      )}

      {blocks.map((block) => (
        <section
          key={block}
          aria-labelledby={`block-${block}`}
          className="flex flex-col gap-2.5 md:hidden"
        >
          <h2 id={`block-${block}`} className={groupHeading}>
            Block {block}
          </h2>
          <ul className={listClass}>
            {shown
              .filter((desk) => desk.block === block)
              .map((desk) => (
                <li
                  key={desk.id}
                  className="border-b border-line last:border-b-0"
                >
                  <DeskAdminSheet desk={desk} data={data} index={index}>
                    <button
                      type="button"
                      className={cn(rowClass, "border-b-0")}
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
                          {desk.owner
                            ? `${desk.owner.id} · ${deskPlace(desk, { short: true })}`
                            : deskPlace(desk, { short: true })}
                        </span>
                      </span>
                      <BookedCount
                        count={index.bookingsOfDesk(desk.id).length}
                      />
                    </button>
                  </DeskAdminSheet>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {shown.length > 0 && (
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <SortHeader
                  label="Desk"
                  column="desk"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="Owner"
                  column="owner"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="Place"
                  column="place"
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
              {table.sorted.map((desk) => (
                <tr key={desk.id} className={tableRow}>
                  <td className={td}>
                    <DeskChip
                      label={deskLabel(desk)}
                      tone={desk.owner ? "taken" : "free"}
                    />
                    {/* The chip is hidden from screen readers. */}
                    <span className="sr-only">{deskLabel(desk)}</span>
                  </td>
                  <td className={td}>
                    {desk.owner ? (
                      <>
                        <span className="font-semibold capitalize">
                          {fullName(desk.owner)}
                        </span>
                        <span className="ml-2 text-ink-muted">
                          {desk.owner.id}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-muted">Unclaimed</span>
                    )}
                  </td>
                  <td className={cn(td, "text-ink-muted")}>
                    {deskPlace(desk, { short: true })}
                  </td>
                  <td className={cn(td, "text-right")}>
                    <BookedCount
                      count={index.bookingsOfDesk(desk.id).length}
                      short
                    />
                  </td>
                  <td className={cn(td, "w-px whitespace-nowrap pr-2")}>
                    <DeskAdminSheet desk={desk} data={data} index={index} menu>
                      <button
                        type="button"
                        aria-label={`Manage desk ${deskLabel(desk)}`}
                        className={cn(rowButton, stretched)}
                      >
                        Manage
                      </button>
                    </DeskAdminSheet>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeskAdminSheet({
  desk,
  data,
  index,
  menu,
  children,
}: {
  desk: AdminDesk;
  data: AdminData;
  index: Index;
  /** Opens a menu of actions instead, each with a sheet of its own. */
  menu?: boolean;
  children: ReactNode;
}) {
  let bookings = index.bookingsOfDesk(desk.id);
  let title = `Desk ${deskLabel(desk)}`;
  let actions: Action[] = [
    { sub: "owner", label: desk.owner ? "Change owner" : "Give to someone" },
    { sub: "bookings", label: "Upcoming bookings" },
  ];
  if (desk.owner) {
    actions.push({
      sub: "unassign",
      label: "Unassign desk",
      danger: true,
    });
  }

  return (
    <AdminSheet
      trigger={children}
      menu={menu ? { label: title, actions } : undefined}
      title={title}
      description={deskPlace(desk)}
      rows={(open) => (
        <>
          <SettingsList>
            <SettingsRow
              label="Owner"
              value={desk.owner ? fullName(desk.owner) : "Nobody"}
              valueClassName="capitalize"
              onClick={() => open("owner")}
            />
            <SettingsRow
              label="Upcoming bookings"
              value={bookedDays(bookings.length)}
              onClick={() => open("bookings")}
            />
          </SettingsList>
          {desk.owner && (
            <SettingsList>
              <SettingsAction
                label="Unassign desk"
                onClick={() => open("unassign")}
              />
            </SettingsList>
          )}
        </>
      )}
      page={(sub, close) =>
        sub === "unassign"
          ? {
              title: "Unassign desk",
              description: title,
              body: (
                <UnassignConfirm desk={desk} index={index} onDone={close} />
              ),
            }
          : sub === "owner"
            ? {
                title: desk.owner ? "Change owner" : "Give to someone",
                description: title,
                body: (
                  <OwnerChoice
                    desk={desk}
                    data={data}
                    index={index}
                    onDone={close}
                  />
                ),
              }
            : {
                title: "Upcoming bookings",
                description: title,
                body: (
                  <BookingSection
                    bookings={bookings}
                    index={index}
                    show="person"
                    clearFields={{ intent: "clear-desk", deskId: desk.id }}
                    empty="Nobody has booked this desk from today on."
                  />
                ),
              }
      }
    />
  );
}

/** Picks the desk's new owner, then says what that changes. */
function OwnerChoice({
  desk,
  data,
  index,
  onDone,
}: {
  desk: AdminDesk;
  data: AdminData;
  index: Index;
  onDone: () => void;
}) {
  let [step, go, frame, key] = useSteps<{ person?: AdminPerson }>({});

  return (
    <div key={key} {...frame}>
      {step.person ? (
        <MoveConfirm
          desk={desk}
          person={step.person}
          index={index}
          onBack={() => go({})}
          onDone={onDone}
        />
      ) : (
        <PersonPicker
          data={data}
          index={index}
          exclude={desk.owner?.id}
          onPick={(person) => go({ person })}
        />
      )}
    </div>
  );
}

function PersonPicker({
  data,
  index,
  exclude,
  onPick,
}: {
  data: AdminData;
  index: Index;
  exclude?: string;
  onPick: (person: AdminPerson) => void;
}) {
  let [query, setQuery] = useState("");
  let people = data.people
    .filter((p) => p.id !== exclude)
    .filter((p) => matches(query, fullName(p), p.id));

  return (
    <div className="flex flex-col gap-3">
      <SearchField
        id="admin-person-picker"
        label="Search name or ID"
        value={query}
        onChange={setQuery}
        results={`${people.length} ${people.length === 1 ? "person" : "people"}`}
      />
      <ul className={listClass}>
        {people.map((person) => {
          let desk =
            person.deskId !== null ? index.desks.get(person.deskId) : null;
          return (
            <li
              key={person.id}
              className="border-b border-line last:border-b-0"
            >
              <button
                type="button"
                onClick={() => onPick(person)}
                className={cn(rowClass, "border-b-0 px-3.5 py-2.5 sm:px-3.5")}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold capitalize leading-tight">
                    {fullName(person)}
                  </span>
                  <span className="truncate text-xs leading-tight text-ink-muted">
                    {person.id} ·{" "}
                    {desk ? `has desk ${deskLabel(desk)}` : "no desk"}
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
          );
        })}
        {people.length === 0 && (
          <li className="px-4 py-5 text-sm text-ink-muted">Nobody matches.</li>
        )}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* People                                                             */
/* ------------------------------------------------------------------ */
