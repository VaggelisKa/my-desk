import { screen, waitFor, within } from "@testing-library/react";
import { getWeek } from "date-fns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../test/render-with-router";
import { DeskModal } from "./desk-selection-modal";

type DeskModalProps = Parameters<typeof DeskModal>[0];

// A Wednesday, so "today" is a bookable weekday.
const WEDNESDAY = new Date(2025, 2, 12, 10);
const SATURDAY = new Date(2025, 2, 15, 10);

let owner = { id: "owner-1", firstName: "jane", lastName: "doe" };
let guest = { id: "guest-1", firstName: "john", lastName: "smith" };

function makeDesk(
  overrides: Partial<DeskModalProps["desk"]> = {},
): DeskModalProps["desk"] {
  return {
    id: 12,
    block: 3,
    row: 2,
    column: 1,
    user: owner,
    reservations: [],
    ...overrides,
  };
}

function reservation(
  day: string,
  users: typeof owner,
  week = getWeek(new Date()),
) {
  return { day, week, date: null, users };
}

function setToday(date: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(date);
}

async function openModal(props: Omit<DeskModalProps, "TriggerElement">) {
  let reserveAction = vi.fn(async ({ request }: { request: Request }) => {
    let formData = await request.formData();
    return { method: request.method, data: Object.fromEntries(formData) };
  });

  let utils = renderWithRouter(
    <DeskModal {...props} TriggerElement={<button>Open desk</button>} />,
    { routes: [{ path: "/reserve", action: reserveAction }] },
  );

  await utils.user.click(screen.getByRole("button", { name: "Open desk" }));
  let dialog = await screen.findByRole("dialog");

  return { ...utils, dialog, reserveAction };
}

beforeEach(() => {
  setToday(WEDNESDAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each(["desktop", "mobile"])("DeskModal on %s", (viewport) => {
  beforeEach(() => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          matches: viewport === "mobile" && query.includes("max-width"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
        }) as unknown as MediaQueryList,
    );
  });
  it("shows the desk location and who it is assigned to", async () => {
    let { dialog } = await openModal({ desk: makeDesk() });

    expect(
      within(dialog).getByRole("heading", { name: "Desk 3.2.1" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("jane doe")).toBeInTheDocument();
  });

  it("shows 'None' for a desk that is not permanently assigned", async () => {
    let { dialog } = await openModal({ desk: makeDesk({ user: null }) });

    expect(within(dialog).getByText("None")).toBeInTheDocument();
  });

  describe("today's borrower", () => {
    it("shows who is using the desk today when it is not the owner", async () => {
      let { dialog } = await openModal({
        desk: makeDesk({ reservations: [reservation("wednesday", guest)] }),
      });

      expect(within(dialog).getByText("Used for today by")).toBeInTheDocument();
      expect(within(dialog).getByText("john smith")).toBeInTheDocument();
    });

    it("does not show a borrower when the owner reserved it", async () => {
      let { dialog } = await openModal({
        desk: makeDesk({ reservations: [reservation("wednesday", owner)] }),
      });

      expect(
        within(dialog).queryByText("Used for today by"),
      ).not.toBeInTheDocument();
    });

    it("ignores reservations for the same weekday in another week", async () => {
      let { dialog } = await openModal({
        desk: makeDesk({
          reservations: [
            reservation("wednesday", guest, getWeek(WEDNESDAY) + 1),
          ],
        }),
      });

      expect(
        within(dialog).queryByText("Used for today by"),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: "Reserve for today" }),
      ).toBeEnabled();
    });
  });

  describe("reserving", () => {
    it("links the desk owner to the reservation page for the desk", async () => {
      let { dialog } = await openModal({
        desk: makeDesk(),
        allowedToReserve: true,
      });

      expect(
        within(dialog).getByRole("link", { name: /reserve/i }),
      ).toHaveAttribute("href", "/reserve/12");
      expect(
        within(dialog).queryByRole("button", { name: "Reserve for today" }),
      ).not.toBeInTheDocument();
    });

    it("lets other users reserve a free desk for today as a guest", async () => {
      let { dialog, user, reserveAction } = await openModal({
        desk: makeDesk(),
      });

      await user.click(
        within(dialog).getByRole("button", { name: "Reserve for today" }),
      );

      await waitFor(() => expect(reserveAction).toHaveBeenCalledTimes(1));
      expect(await reserveAction.mock.results[0].value).toEqual({
        method: "POST",
        data: {
          deskId: "12",
          week: String(getWeek(WEDNESDAY)),
          wednesday: "on",
          intent: "reserve-guest",
        },
      });
    });

    it("does not offer a guest reservation when the desk is taken today", async () => {
      let { dialog } = await openModal({
        desk: makeDesk({ reservations: [reservation("wednesday", guest)] }),
      });

      expect(
        within(dialog).queryByRole("button", { name: "Reserve for today" }),
      ).not.toBeInTheDocument();
    });

    it.each([SATURDAY, new Date(2025, 2, 16, 10)])(
      "does not offer a guest reservation on %s",
      async (date) => {
        setToday(date);

        let { dialog } = await openModal({ desk: makeDesk() });

        expect(
          within(dialog).queryByRole("button", { name: "Reserve for today" }),
        ).not.toBeInTheDocument();
      },
    );
  });

  describe("editing", () => {
    it("links admins to the desk edit page", async () => {
      let { dialog } = await openModal({
        desk: makeDesk(),
        allowedToEdit: true,
      });

      expect(
        within(dialog).getByRole("link", { name: "Edit desk info" }),
      ).toHaveAttribute("href", "/desks/12/edit");
    });

    it("hides the edit link from non-admins", async () => {
      let { dialog } = await openModal({ desk: makeDesk() });

      expect(
        within(dialog).queryByRole("link", { name: "Edit desk info" }),
      ).not.toBeInTheDocument();
    });
  });
});
