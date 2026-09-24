import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The toast store is module-level state, so each test gets fresh modules.
let toast: typeof import("./use-toast").toast;
let Toaster: typeof import("./toaster").Toaster;

beforeEach(async () => {
  vi.resetModules();
  ({ toast } = await import("./use-toast"));
  ({ Toaster } = await import("./toaster"));
});

describe("Toaster", () => {
  it("shows a toast's title and description", () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Reservation added", description: "Desk 3.2.1" });
    });

    expect(screen.getByText("Reservation added")).toBeInTheDocument();
    expect(screen.getByText("Desk 3.2.1")).toBeInTheDocument();
  });

  it("only shows the most recent toast", () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "First" });
      toast({ title: "Second" });
    });

    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("updates a toast in place", () => {
    render(<Toaster />);

    let handle!: ReturnType<typeof toast>;
    act(() => {
      handle = toast({ title: "Saving…" });
    });
    act(() => {
      handle.update({ id: handle.id, title: "Saved" });
    });

    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("hides a toast when it is dismissed", async () => {
    render(<Toaster />);

    let handle!: ReturnType<typeof toast>;
    act(() => {
      handle = toast({ title: "Reservation added" });
    });
    act(() => {
      handle.dismiss();
    });

    await waitFor(() =>
      expect(screen.queryByText("Reservation added")).not.toBeInTheDocument(),
    );
  });

  it("can be closed by the user", async () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Reservation added" });
    });

    await userEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.queryByText("Reservation added")).not.toBeInTheDocument(),
    );
  });
});
