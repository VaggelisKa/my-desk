import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeskButton } from "./desk-button";

describe("DeskButton", () => {
  it("is labelled with the name of the desk owner", () => {
    render(<DeskButton name="jane" />);

    expect(screen.getByRole("button", { name: "jane" })).toBeInTheDocument();
  });

  it("is labelled as unclaimed when the desk has no owner", () => {
    render(<DeskButton />);

    expect(
      screen.getByRole("button", { name: "Unclaimed" }),
    ).toBeInTheDocument();
  });

  it("cannot be clicked when disabled", async () => {
    let onClick = vi.fn();
    render(<DeskButton name="jane" disabled onClick={onClick} />);

    await userEvent.click(screen.getByRole("button", { name: "jane" }));

    expect(onClick).not.toHaveBeenCalled();
  });
});
