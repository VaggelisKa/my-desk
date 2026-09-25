import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Silk measures the viewport and animates with real layout, which jsdom does
// not have (the e2e suite covers the real sheet). Reduce it to markup that
// shows while presented.
vi.mock("@silk-hq/components", () => {
  let SheetContext = React.createContext({
    presented: false,
    setPresented: (_value: boolean) => {},
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

  function View({
    children,
    onTravelStatusChange,
  }: React.PropsWithChildren<{
    onTravelStatusChange?: (status: string) => void;
  }>) {
    let { presented } = React.useContext(SheetContext);
    React.useEffect(() => {
      onTravelStatusChange?.(presented ? "idleInside" : "idleOutside");
    }, [presented, onTravelStatusChange]);
    return presented ? <div>{children}</div> : null;
  }

  function Trigger({
    children,
    action: _action,
    ...props
  }: React.ComponentProps<"button"> & { action?: string }) {
    let { setPresented } = React.useContext(SheetContext);
    return (
      <button type="button" {...props} onClick={() => setPresented(false)}>
        {children}
      </button>
    );
  }

  let passthrough = ({
    children,
    asChild: _asChild,
    ...props
  }: React.ComponentProps<"div"> & { asChild?: boolean }) => (
    <div {...props}>{children}</div>
  );

  return {
    Sheet: {
      Root,
      Portal: ({ children }: React.PropsWithChildren) => <>{children}</>,
      View,
      Content: passthrough,
      SpecialWrapper: { Root: passthrough, Content: passthrough },
      Title: passthrough,
      Description: passthrough,
      Trigger,
    },
  };
});

// The toast store is module-level state, so each test gets fresh modules.
let toast: typeof import("./use-toast").toast;
let Toaster: typeof import("./toaster").Toaster;

beforeEach(async () => {
  vi.resetModules();
  ({ toast } = await import("./use-toast"));
  ({ Toaster } = await import("./toaster"));
});

function card() {
  return document.querySelector("[data-toast]");
}

describe("Toaster", () => {
  it("shows a toast's title and description", () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Reservation added", description: "Desk 3.2.1" });
    });

    expect(card()).toHaveTextContent("Reservation added");
    expect(card()).toHaveTextContent("Desk 3.2.1");
    expect(card()).toHaveAttribute("data-toast", "success");
  });

  it("announces the toast to screen readers", () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Reservation added", description: "Desk 3.2.1" });
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Reservation added Desk 3.2.1",
    );
  });

  it("marks errors", () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Desk already reserved", variant: "error" });
    });

    expect(card()).toHaveAttribute("data-toast", "error");
  });

  it("only shows the most recent toast", () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "First" });
      toast({ title: "Second" });
    });

    expect(card()).not.toHaveTextContent("First");
    expect(card()).toHaveTextContent("Second");
  });

  it("updates a toast in place", () => {
    render(<Toaster />);

    let handle!: ReturnType<typeof toast>;
    act(() => {
      handle = toast({ title: "Saving…" });
    });
    act(() => {
      handle.update({ title: "Saved" });
    });

    expect(card()).toHaveTextContent("Saved");
    expect(card()).not.toHaveTextContent("Saving…");
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

    await waitFor(() => expect(card()).not.toBeInTheDocument());
  });

  it("goes away on its own after its duration", async () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Reservation added", duration: 50 });
    });
    expect(card()).toBeInTheDocument();

    await waitFor(() => expect(card()).not.toBeInTheDocument());
  });

  it("can be closed by the user", async () => {
    render(<Toaster />);

    act(() => {
      toast({ title: "Reservation added" });
    });

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(card()).not.toBeInTheDocument());
  });
});
