import { screen, waitFor, within } from "@testing-library/react";
import { getWeek } from "date-fns";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../test/render-with-router";
import { DeskSheet } from "./desk-sheet";

// Silk drives real gestures and viewport measurements that jsdom does not
// have. The e2e suite exercises the real sheet; here it is reduced to a plain
// dialog so the sheet's content and actions can be tested.
vi.mock("@silk-hq/components", () => {
  type Ctx = { presented: boolean; setPresented: (value: boolean) => void };
  let SheetContext = React.createContext<Ctx>({
    presented: false,
    setPresented: () => {},
  });

  function Root({
    children,
    presented = false,
    onPresentedChange = () => {},
  }: React.PropsWithChildren<{
    presented?: boolean;
    onPresentedChange?: (value: boolean) => void;
  }>) {
    return (
      <SheetContext.Provider
        value={{ presented, setPresented: onPresentedChange }}
      >
        {children}
      </SheetContext.Provider>
    );
  }

  function Trigger({
    children,
  }: {
    children: React.ReactElement<{ onClick?: () => void }>;
  }) {
    let { setPresented } = React.useContext(SheetContext);
    return React.cloneElement(children, { onClick: () => setPresented(true) });
  }

  function View({ children }: React.PropsWithChildren) {
    let { presented } = React.useContext(SheetContext);
    return presented ? <div role="dialog">{children}</div> : null;
  }

  let passthrough =
    (Tag: "div" | "h2" | "p") =>
    ({ children }: React.PropsWithChildren) => <Tag>{children}</Tag>;

  return {
    Sheet: {
      Root,
      Trigger,
      Portal: passthrough("div"),
      View,
      Backdrop: () => null,
      Content: passthrough("div"),
      BleedingBackground: () => null,
      Handle: () => null,
      Title: passthrough("h2"),
      Description: passthrough("p"),
    },
  };
});

type DeskSheetProps = Parameters<typeof DeskSheet>[0];

// A Wednesday, so "today" is a bookable weekday.
const WEDNESDAY = new Date(2025, 2, 12, 10);
const SATURDAY = new Date(2025, 2, 15, 10);

let owner = { id: "owner-1", firstName: "jane", lastName: "doe" };
let guest = { id: "guest-1", firstName: "john", lastName: "smith" };

function makeDesk(
  overrides: Partial<DeskSheetProps["desk"]> = {},
): DeskSheetProps["desk"] {
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

async function openSheet(props: Omit<DeskSheetProps, "children">) {
  let reserveAction = vi.fn(async ({ request }: { request: Request }) => {
    let formData = await request.formData();
    return {
      method: request.method,
      data: Object.fromEntries(formData),
      dates: formData.getAll("date"),
    };
  });

  let utils = renderWithRouter(
    <DeskSheet {...props}>
      <button>Open desk</button>
    </DeskSheet>,
    // The sheet posts to the desks page, i.e. the index route.
    { path: "/sheet", routes: [{ index: true, action: reserveAction }] },
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

describe("DeskSheet", () => {
  it("shows the desk location and who it is assigned to", async () => {
    let { dialog } = await openSheet({ desk: makeDesk() });

    expect(
      within(dialog).getByRole("heading", { name: "Desk 3.2.1" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Block 3 · row 2 · by the window"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("jane doe")).toBeInTheDocument();
  });

  it("shows 'None' for a desk that is not permanently assigned", async () => {
    let { dialog } = await openSheet({ desk: makeDesk({ user: null }) });

    expect(within(dialog).getByText("None")).toBeInTheDocument();
  });

  describe("today", () => {
    it("says the desk is free when nobody has it", async () => {
      let { dialog } = await openSheet({ desk: makeDesk() });

      expect(within(dialog).getByText("Today")).toBeInTheDocument();
      expect(
        within(dialog).getByText("Free", { selector: "p" }),
      ).toBeInTheDocument();
    });

    it("names whoever is borrowing the desk today", async () => {
      let { dialog } = await openSheet({
        desk: makeDesk({ reservations: [reservation("wednesday", guest)] }),
      });

      expect(within(dialog).getByText("john smith")).toBeInTheDocument();
      expect(within(dialog).getByText("is borrowing it")).toBeInTheDocument();
    });

    it("says the owner is in when they reserved their own desk", async () => {
      let { dialog } = await openSheet({
        desk: makeDesk({ reservations: [reservation("wednesday", owner)] }),
      });

      expect(within(dialog).getAllByText("jane doe")).toHaveLength(2);
      expect(within(dialog).getByText("is in")).toBeInTheDocument();
      expect(
        within(dialog).queryByText("is borrowing it"),
      ).not.toBeInTheDocument();
    });

    it("still names you when you are the one sitting there", async () => {
      let { dialog } = await openSheet({
        desk: makeDesk({ reservations: [reservation("wednesday", guest)] }),
        userId: guest.id,
      });

      expect(within(dialog).getByText("john smith")).toBeInTheDocument();
      expect(within(dialog).getByText("is borrowing it")).toBeInTheDocument();
    });

    it("says it is the weekend instead of free", async () => {
      setToday(SATURDAY);

      let { dialog } = await openSheet({ desk: makeDesk() });

      expect(within(dialog).getByText("Weekend")).toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: "Reserve for today" }),
      ).not.toBeInTheDocument();
    });

    it("ignores reservations for the same weekday in another week", async () => {
      let { dialog } = await openSheet({
        desk: makeDesk({
          reservations: [
            reservation("wednesday", guest, getWeek(WEDNESDAY) + 1),
          ],
        }),
      });

      expect(
        within(dialog).queryByText("is borrowing it"),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).getByRole("button", { name: "Reserve for today" }),
      ).toBeEnabled();
    });
  });

  it("marks the next two weeks with real dates and who has them", async () => {
    let { dialog } = await openSheet({
      desk: makeDesk({
        reservations: [
          reservation("thursday", guest),
          reservation("friday", owner),
        ],
      }),
      userId: owner.id,
    });

    expect(
      within(dialog).getByRole("img", { name: "Thu 13 Mar, taken by john" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: "Fri 14 Mar, reserved by you" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: "Mon 10 Mar, past" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: "Mon 17 Mar, free" }),
    ).toBeInTheDocument();
  });

  describe("reserving", () => {
    it("lets the desk owner pick free days from the grid and book them", async () => {
      let { dialog, user, reserveAction } = await openSheet({
        desk: makeDesk({ reservations: [reservation("thursday", guest)] }),
        allowedToReserve: true,
        userId: owner.id,
      });

      expect(
        within(dialog).getByRole("button", { name: "Pick days to book" }),
      ).toBeDisabled();
      // Taken and past days stay a readout.
      expect(
        within(dialog).getByRole("img", { name: "Thu 13 Mar, taken by john" }),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByRole("img", { name: "Mon 10 Mar, past" }),
      ).toBeInTheDocument();

      await user.click(
        within(dialog).getByRole("checkbox", { name: "Wed 12 Mar, free" }),
      );
      await user.click(
        within(dialog).getByRole("checkbox", { name: "Mon 17 Mar, free" }),
      );
      await user.click(
        within(dialog).getByRole("button", { name: "Book 2 days" }),
      );

      await waitFor(() => expect(reserveAction).toHaveBeenCalledTimes(1));
      let { data, dates } = await reserveAction.mock.results[0].value;
      expect(data.deskId).toBe("12");
      expect(dates).toEqual(["12.03.2025", "17.03.2025"]);
      expect(
        within(dialog).queryByRole("button", { name: "Reserve for today" }),
      ).not.toBeInTheDocument();
    });

    it("stops offering today to the owner from 11:00", async () => {
      setToday(new Date(2025, 2, 12, 11));

      let { dialog } = await openSheet({
        desk: makeDesk(),
        allowedToReserve: true,
      });

      expect(
        within(dialog).queryByRole("checkbox", { name: /12 Mar/ }),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).getByRole("checkbox", { name: "Thu 13 Mar, free" }),
      ).toBeInTheDocument();
    });

    it("shows other users the grid as a readout only", async () => {
      let { dialog } = await openSheet({ desk: makeDesk() });

      expect(within(dialog).queryAllByRole("checkbox")).toHaveLength(0);
    });

    it("lets other users reserve a free desk for today as a guest", async () => {
      let { dialog, user, reserveAction } = await openSheet({
        desk: makeDesk(),
      });

      await user.click(
        within(dialog).getByRole("button", { name: "Reserve for today" }),
      );

      await waitFor(() => expect(reserveAction).toHaveBeenCalledTimes(1));
      expect(await reserveAction.mock.results[0].value).toEqual({
        method: "POST",
        data: { deskId: "12", date: "12.03.2025" },
        dates: ["12.03.2025"],
      });
    });

    it("offers no reservation when the desk is taken today", async () => {
      let { dialog } = await openSheet({
        desk: makeDesk({ reservations: [reservation("wednesday", guest)] }),
      });

      expect(
        within(dialog).queryByRole("button", { name: "Reserve for today" }),
      ).not.toBeInTheDocument();
    });

    it("starts the two-week grid from the coming week on a Saturday", async () => {
      setToday(SATURDAY);

      let { dialog } = await openSheet({ desk: makeDesk() });

      expect(
        within(dialog).getByRole("img", { name: "Mon 17 Mar, free" }),
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByRole("img", { name: /10 Mar/ }),
      ).not.toBeInTheDocument();
      expect(within(dialog).getByText("Upcoming week")).toBeInTheDocument();
      expect(within(dialog).queryByText("This week")).not.toBeInTheDocument();
    });

    it("labels the first row this week on a weekday", async () => {
      let { dialog } = await openSheet({ desk: makeDesk() });

      expect(within(dialog).getByText("This week")).toBeInTheDocument();
      expect(within(dialog).getByText("Next week")).toBeInTheDocument();
    });

    it.each([SATURDAY, new Date(2025, 2, 16, 10)])(
      "does not offer a guest reservation on %s",
      async (date) => {
        setToday(date);

        let { dialog } = await openSheet({ desk: makeDesk() });

        expect(
          within(dialog).queryByRole("button", { name: "Reserve for today" }),
        ).not.toBeInTheDocument();
      },
    );
  });

  describe("editing", () => {
    it("links admins to the desk edit page", async () => {
      let { dialog } = await openSheet({
        desk: makeDesk(),
        allowedToEdit: true,
      });

      expect(
        within(dialog).getByRole("link", { name: "Edit desk info" }),
      ).toHaveAttribute("href", "/desks/12/edit");
    });

    it("hides the edit link from non-admins", async () => {
      let { dialog } = await openSheet({ desk: makeDesk() });

      expect(
        within(dialog).queryByRole("link", { name: "Edit desk info" }),
      ).not.toBeInTheDocument();
    });
  });
});
