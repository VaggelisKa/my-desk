import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../test/render-with-router";
import { ReservationsTable } from "./reservations-table";

type Reservation = Parameters<
  typeof ReservationsTable
>[0]["reservations"][number];

let jane = {
  id: "user-1",
  firstName: "jane",
  lastName: "doe",
} as Reservation["users"];

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    deskId: 12,
    day: "monday",
    week: 11,
    date: "10.03.2025",
    desks: { block: 3, row: 2, column: 1 },
    users: jane,
    ...overrides,
  };
}

let monday = makeReservation();
let friday = makeReservation({
  deskId: 7,
  day: "friday",
  date: "14.03.2025",
  desks: { block: 5, row: 1, column: 3 },
});

function renderTable(action: (request: Request) => Promise<unknown>) {
  let deleteAction = vi.fn(({ request }: { request: Request }) =>
    action(request),
  );

  let utils = renderWithRouter(
    <ReservationsTable reservations={[monday, friday]} />,
    { path: "/reservations", action: deleteAction },
  );

  return { ...utils, deleteAction };
}

function bodyRows() {
  // The first row is the table header.
  return screen.getAllByRole("row").slice(1);
}

function deleteButton(row: HTMLElement) {
  return within(row).getByRole("button", { name: "Delete reservation" });
}

describe("ReservationsTable", () => {
  it("lists each reservation with its date, desk and user", () => {
    renderWithRouter(<ReservationsTable reservations={[monday, friday]} />);

    let [first, second] = bodyRows();

    expect(within(first).getByText("monday (10.03.2025)")).toBeInTheDocument();
    expect(
      within(first).getByText("Block 3, Row 2, Column 1"),
    ).toBeInTheDocument();
    expect(within(first).getByText("jane doe")).toBeInTheDocument();

    expect(within(second).getByText("friday (14.03.2025)")).toBeInTheDocument();
    expect(
      within(second).getByText("Block 5, Row 1, Column 3"),
    ).toBeInTheDocument();
  });

  it("sends a DELETE identifying the reservation by desk, date, day and user", async () => {
    let submission: { method: string; data: Record<string, unknown> } | null =
      null;
    let { user } = renderTable(async (request) => {
      submission = {
        method: request.method,
        data: Object.fromEntries(await request.formData()),
      };
      return null;
    });

    await user.click(deleteButton(bodyRows()[1]));

    await waitFor(() =>
      expect(submission).toEqual({
        method: "DELETE",
        data: {
          "desk-id": "7",
          "reservation-date": "14.03.2025",
          "reservation-day": "friday",
          "reservation-user-id": "user-1",
        },
      }),
    );
  });

  it("omits the date for reservations that do not have one", async () => {
    let submitted: Record<string, unknown> | null = null;
    let { user } = renderWithRouter(
      <ReservationsTable reservations={[makeReservation({ date: null })]} />,
      {
        path: "/reservations",
        action: async ({ request }) => {
          submitted = Object.fromEntries(await request.formData());
          return null;
        },
      },
    );

    await user.click(
      screen.getByRole("button", { name: "Delete reservation" }),
    );

    await waitFor(() => expect(submitted).not.toBeNull());
    expect(submitted).not.toHaveProperty("reservation-date");
  });

  it("disables only the delete button of the reservation being deleted", async () => {
    let finishDelete!: () => void;
    let { user, deleteAction } = renderTable(
      () => new Promise((resolve) => (finishDelete = () => resolve(null))),
    );

    let [first, second] = bodyRows();
    await user.click(deleteButton(second));

    await waitFor(() => expect(deleteButton(second)).toBeDisabled());
    expect(deleteButton(first)).toBeEnabled();

    finishDelete();

    await waitFor(() => expect(deleteButton(second)).toBeEnabled());
    expect(deleteAction).toHaveBeenCalledTimes(1);
  });
});
