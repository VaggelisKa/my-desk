import { screen, waitFor } from "@testing-library/react";
import { useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithRouter } from "../../test/render-with-router";
import { DayStrip, DeskFilters } from "./desk-filters";

// A Wednesday. Mon to Fri run 10 to 14 March, next week 17 to 21.
const TODAY = new Date(2025, 2, 12, 10);

function CurrentSearch() {
  let { search } = useLocation();
  return <output aria-label="search">{search}</output>;
}

function renderFilters(initialEntry = "/") {
  return renderWithRouter(
    <>
      <DayStrip />
      <DeskFilters />
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

describe("DeskFilters", () => {
  it("restores the filters from the URL", () => {
    renderFilters("/?show-free=on&column=1&block=4&selected-day=14.03.2025");

    expect(screen.getByRole("checkbox", { name: "Free only" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Window" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("combobox", { name: "Block" })).toHaveValue("4");
    expect(
      screen.getByRole("link", { name: "Friday 14 March" }),
    ).toHaveAttribute("aria-current", "date");
  });

  it("selects today by default", () => {
    renderFilters();

    expect(
      screen.getByRole("link", { name: "Wednesday 12 March" }),
    ).toHaveAttribute("aria-current", "date");
    expect(
      screen.getByRole("link", { name: "Next week →" }),
    ).toBeInTheDocument();
  });

  it("filters to free desks when the chip is ticked", async () => {
    let { user } = renderFilters();

    await user.click(screen.getByRole("checkbox", { name: "Free only" }));

    await expectSearchParams({
      "show-free": "on",
      column: "all",
      block: "all",
    });
  });

  it("filters by placement, and clears it when pressed again", async () => {
    let { user } = renderFilters();

    await user.click(screen.getByRole("button", { name: "Window" }));
    await expectSearchParams({ column: "1", block: "all" });

    await user.click(screen.getByRole("button", { name: "Window" }));
    await expectSearchParams({ column: "all", block: "all" });
  });

  it("filters by block", async () => {
    let { user } = renderFilters();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Block" }),
      "4",
    );

    await expectSearchParams({ column: "all", block: "4" });
  });

  it("keeps the selected day when another filter changes", async () => {
    let { user } = renderFilters("/?selected-day=14.03.2025&column=2");

    await user.click(screen.getByRole("checkbox", { name: "Free only" }));

    await expectSearchParams({
      "show-free": "on",
      column: "2",
      block: "all",
      "selected-day": "14.03.2025",
    });
  });

  it("links each day of the week with the other filters kept", () => {
    renderFilters("/?column=1");

    expect(
      screen.getByRole("link", { name: "Friday 14 March" }),
    ).toHaveAttribute("href", "/?column=1&selected-day=14.03.2025");
  });

  it("switches to Monday of next week", () => {
    renderFilters();

    expect(screen.getByRole("link", { name: "Next week →" })).toHaveAttribute(
      "href",
      "/?selected-day=17.03.2025",
    );
  });

  it("treats a malformed or loosely typed day as today", () => {
    let { unmount } = renderFilters("/?selected-day=foo");
    expect(
      screen.getByRole("link", { name: "Wednesday 12 March" }),
    ).toHaveAttribute("aria-current", "date");
    unmount();

    renderFilters("/?selected-day=13.3.2025");
    expect(
      screen.getByRole("link", { name: "Thursday 13 March" }),
    ).toHaveAttribute("aria-current", "date");
  });

  it("keeps focus on the chip that was toggled", async () => {
    let { user } = renderFilters();
    let checkbox = screen.getByRole("checkbox", { name: "Free only" });

    await user.click(checkbox);
    await expectSearchParams({
      "show-free": "on",
      column: "all",
      block: "all",
    });

    expect(checkbox).toHaveFocus();
    expect(checkbox).toBeChecked();
  });

  it("stays on this week on a Friday afternoon", () => {
    vi.setSystemTime(new Date(2025, 2, 14, 16));
    renderFilters();

    expect(
      screen.getByRole("link", { name: "Friday 14 March" }),
    ).toHaveAttribute("aria-current", "date");
    expect(screen.getByRole("link", { name: "Next week →" })).toHaveAttribute(
      "href",
      "/?selected-day=17.03.2025",
    );
  });

  it("shows next week's days when the selected day is in it", () => {
    renderFilters("/?selected-day=18.03.2025");

    expect(
      screen.getByRole("link", { name: "Tuesday 18 March" }),
    ).toHaveAttribute("aria-current", "date");
    expect(screen.getByRole("link", { name: "← This week" })).toHaveAttribute(
      "href",
      "/?selected-day=14.03.2025",
    );
    expect(
      screen.queryByRole("link", { name: "Tuesday 11 March" }),
    ).not.toBeInTheDocument();
  });

  it("has desktop arrows that flip the week", () => {
    let { unmount } = renderFilters();
    expect(screen.getByRole("link", { name: "Next week" })).toHaveAttribute(
      "href",
      "/?selected-day=17.03.2025",
    );
    expect(
      screen.queryByRole("link", { name: "Previous week" }),
    ).not.toBeInTheDocument();
    unmount();

    renderFilters("/?selected-day=18.03.2025");
    expect(screen.getByRole("link", { name: "Previous week" })).toHaveAttribute(
      "href",
      "/?selected-day=14.03.2025",
    );
    expect(
      screen.queryByRole("link", { name: "Next week" }),
    ).not.toBeInTheDocument();
  });
});
