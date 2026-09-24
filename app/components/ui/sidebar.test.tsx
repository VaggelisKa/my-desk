import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SidebarProvider, SidebarTrigger, useSidebar } from "./sidebar";

function SidebarState() {
  let { state } = useSidebar();
  return <output aria-label="sidebar state">{state}</output>;
}

function sidebarState() {
  return screen.getByRole("status", { name: "sidebar state" }).textContent;
}

function renderProvider(props: { defaultOpen?: boolean } = {}) {
  return render(
    <SidebarProvider {...props}>
      <SidebarTrigger />
      <SidebarState />
    </SidebarProvider>,
  );
}

afterEach(() => {
  document.cookie = "sidebar_state=; max-age=0; path=/";
});

describe("SidebarProvider", () => {
  it("starts in the default state it is given", () => {
    renderProvider({ defaultOpen: false });

    expect(sidebarState()).toBe("collapsed");
  });

  it("toggles with the trigger and remembers the choice in a cookie", async () => {
    renderProvider();
    expect(sidebarState()).toBe("expanded");

    await userEvent.click(
      screen.getByRole("button", { name: "Toggle Sidebar" }),
    );

    expect(sidebarState()).toBe("collapsed");
    expect(document.cookie).toContain("sidebar_state=false");

    await userEvent.click(
      screen.getByRole("button", { name: "Toggle Sidebar" }),
    );

    expect(sidebarState()).toBe("expanded");
    expect(document.cookie).toContain("sidebar_state=true");
  });

  it.each([{ ctrlKey: true }, { metaKey: true }])(
    "toggles with the keyboard shortcut (%o + B)",
    (modifier) => {
      renderProvider();

      fireEvent.keyDown(window, { key: "b", ...modifier });

      expect(sidebarState()).toBe("collapsed");
    },
  );

  it("ignores B without a modifier key", () => {
    renderProvider();

    fireEvent.keyDown(window, { key: "b" });

    expect(sidebarState()).toBe("expanded");
  });

  it("throws a helpful error when used outside the provider", () => {
    // React logs the thrown error before rethrowing it.
    let consoleError = console.error;
    console.error = () => {};

    try {
      expect(() => render(<SidebarState />)).toThrow(
        "useSidebar must be used within a SidebarProvider.",
      );
    } finally {
      console.error = consoleError;
    }
  });
});
