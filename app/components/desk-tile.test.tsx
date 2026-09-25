import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeskTile } from "./desk-tile";

describe("DeskTile", () => {
  it("is labelled with the name of the desk owner", () => {
    render(<DeskTile name="jane" label="1.1.1" row={1} />);

    expect(screen.getByRole("button", { name: "jane" })).toBeInTheDocument();
    expect(screen.getByText("1.1.1")).toBeInTheDocument();
  });

  it("is labelled as unclaimed when the desk has no owner", () => {
    render(<DeskTile label="2.1.1" row={1} />);

    expect(
      screen.getByRole("button", { name: "Unclaimed" }),
    ).toBeInTheDocument();
  });

  it("describes the number, state and sitter for screen readers", () => {
    render(
      <DeskTile
        name="jane"
        label="1.1.1"
        row={1}
        state="taken"
        sitter="john"
      />,
    );

    expect(
      screen.getByRole("button", { name: "jane" }),
    ).toHaveAccessibleDescription("Desk 1.1.1, taken, john is sitting here");
  });

  it("exposes its state for styling", () => {
    render(<DeskTile name="jane" label="1.1.1" row={1} state="mine" />);

    expect(screen.getByRole("button")).toHaveAttribute("data-state", "mine");
  });

  it("cannot be clicked when dimmed by a filter", async () => {
    let onClick = vi.fn();
    render(
      <DeskTile name="jane" label="1.1.1" row={1} dimmed onClick={onClick} />,
    );

    let tile = screen.getByRole("button", { name: "jane" });
    expect(tile).toBeDisabled();
    await userEvent.click(tile);

    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls the handler when an enabled desk is clicked", async () => {
    let onClick = vi.fn();
    render(<DeskTile name="jane" label="1.1.1" row={1} onClick={onClick} />);

    await userEvent.click(screen.getByRole("button", { name: "jane" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
