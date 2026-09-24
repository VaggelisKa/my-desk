import { screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../test/render-with-router";
import { FiltersForm } from "./filters-form";

const TODAY = new Date(2025, 2, 12, 10);

function CurrentSearch() {
  let { search } = useLocation();
  return <output aria-label="search">{search}</output>;
}

function placementSelect() {
  return screen.getByRole("combobox", { name: "Desk placement" });
}

function blockSelect() {
  return screen.getByRole("combobox", { name: "Block" });
}

function calendarDay(name: RegExp) {
  return within(screen.getByRole("dialog")).getByRole("button", { name });
}

function renderFilters(initialEntry = "/") {
  return renderWithRouter(
    <>
      <FiltersForm />
      <CurrentSearch />
    </>,
    { initialEntry },
  );
}

async function expectSearchParams(expected: Record<string, string>) {
  await waitFor(() => {
    let search = screen.getByRole("status", { name: "search" }).textContent;
    expect([...new URLSearchParams(search ?? "")].sort()).toEqual(
      Object.entries(expected).sort(),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FiltersForm", () => {
  it("restores the filters from the URL", () => {
    renderFilters("/?show-free=on&column=1&block=4&selected-day=14.03.2025");

    expect(
      screen.getByRole("checkbox", { name: "Show free desks only" }),
    ).toBeChecked();
    expect(placementSelect()).toHaveTextContent("window");
    expect(blockSelect()).toHaveTextContent("4");
    expect(
      screen.getByRole("button", { name: "March 14th, 2025" }),
    ).toBeInTheDocument();
  });

  it("filters to free desks when the checkbox is ticked", async () => {
    let { user } = renderFilters();

    await user.click(
      screen.getByRole("checkbox", { name: "Show free desks only" }),
    );

    await expectSearchParams({
      "show-free": "on",
      column: "all",
      block: "all",
    });
  });

  it("filters by desk placement", async () => {
    let { user } = renderFilters();

    await user.click(placementSelect());
    await user.click(await screen.findByRole("option", { name: "aisle" }));

    await expectSearchParams({ column: "3", block: "all" });
  });

  it("filters by block while keeping the other filters", async () => {
    let { user } = renderFilters("/?show-free=on&column=2");

    await user.click(blockSelect());
    await user.click(await screen.findByRole("option", { name: "5" }));

    await expectSearchParams({ "show-free": "on", column: "2", block: "5" });
  });

  it("filters by a picked date and clears it when unpicked", async () => {
    let { user } = renderFilters("/?show-free=on&column=2&block=4");

    await user.click(
      screen.getByRole("button", { name: "View specific date" }),
    );
    await user.click(calendarDay(/March 20th/));

    await expectSearchParams({
      "show-free": "on",
      column: "2",
      block: "4",
      "selected-day": "20.03.2025",
    });

    // The popover stays open, so the same day can be clicked again to unpick it.
    await user.click(calendarDay(/March 20th/));

    await expectSearchParams({ "show-free": "on", column: "2", block: "4" });
  });

  it.each(["placement", "block", "free desks"])(
    "keeps the selected date when changing %s",
    async (filter) => {
      let { user } = renderFilters(
        "/?show-free=on&column=2&block=4&selected-day=14.03.2025",
      );
      if (filter === "free desks") {
        await user.click(
          screen.getByRole("checkbox", { name: "Show free desks only" }),
        );
      } else {
        await user.click(
          filter === "placement" ? placementSelect() : blockSelect(),
        );
        await user.click(
          await screen.findByRole("option", {
            name: filter === "placement" ? "aisle" : "5",
          }),
        );
      }
      await expectSearchParams({
        ...(filter === "free desks" ? {} : { "show-free": "on" }),
        column: filter === "placement" ? "3" : "2",
        block: filter === "block" ? "5" : "4",
        "selected-day": "14.03.2025",
      });
    },
  );

  it("replaces the selected date without submitting duplicate dates", async () => {
    let { user } = renderFilters("/?column=2&block=4&selected-day=14.03.2025");
    await user.click(screen.getByRole("button", { name: "March 14th, 2025" }));
    await user.click(calendarDay(/March 20th/));

    await expectSearchParams({
      column: "2",
      block: "4",
      "selected-day": "20.03.2025",
    });
  });
});
