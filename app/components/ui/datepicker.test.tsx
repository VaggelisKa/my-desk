import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatePicker } from "./datepicker";

const TODAY = new Date(2025, 2, 12, 10);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

// Day buttons live in the calendar popover, labelled e.g. "Friday, March 14th, 2025".
function dayButton(name: RegExp) {
  return within(screen.getByRole("dialog")).getByRole("button", { name });
}

describe("DatePicker", () => {
  it("shows a placeholder until a date is picked", () => {
    render(<DatePicker onDateChange={() => {}} />);

    expect(
      screen.getByRole("button", { name: "View specific date" }),
    ).toBeInTheDocument();
  });

  it("shows the initial date", () => {
    render(
      <DatePicker
        initialDate={new Date(2025, 2, 14)}
        onDateChange={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: "March 14th, 2025" }),
    ).toBeInTheDocument();
  });

  it("reports and displays the picked date", async () => {
    let user = userEvent.setup();
    let onDateChange = vi.fn();
    render(<DatePicker onDateChange={onDateChange} />);

    await user.click(
      screen.getByRole("button", { name: "View specific date" }),
    );
    await user.click(dayButton(/March 14/));

    expect(onDateChange).toHaveBeenCalledWith(new Date(2025, 2, 14));
    expect(
      screen.getByRole("button", { name: "March 14th, 2025" }),
    ).toBeInTheDocument();
  });

  it("clears the date when the selected day is picked again", async () => {
    let user = userEvent.setup();
    let onDateChange = vi.fn();
    render(
      <DatePicker
        initialDate={new Date(2025, 2, 14)}
        onDateChange={onDateChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "March 14th, 2025" }));
    await user.click(dayButton(/March 14/));

    expect(onDateChange).toHaveBeenLastCalledWith(undefined);
    expect(
      screen.getByRole("button", { name: "View specific date" }),
    ).toBeInTheDocument();
  });

  it("only allows picking dates from today up to two weeks ahead", async () => {
    let user = userEvent.setup();
    render(<DatePicker onDateChange={() => {}} />);

    await user.click(
      screen.getByRole("button", { name: "View specific date" }),
    );

    expect(dayButton(/March 11/)).toBeDisabled();
    expect(dayButton(/March 12/)).toBeEnabled();
    expect(dayButton(/March 26/)).toBeEnabled();
    expect(dayButton(/March 27/)).toBeDisabled();
  });
});
