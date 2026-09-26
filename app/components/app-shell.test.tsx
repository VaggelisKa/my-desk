import { act, screen, within } from "@testing-library/react";
import { Link, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../test/render-with-router";
import {
  activeTab,
  AppMenu,
  Dock,
  Masthead,
  type ShellUser,
} from "./app-shell";

let user: ShellUser = {
  id: "emp042",
  firstName: "Vaggelis",
  lastName: "Karavasileiadis",
  role: "admin",
  desk: { id: 7, block: 2, row: 1, column: 2 },
};

function renderShell(pathname: string, shellUser: ShellUser = user) {
  return renderWithRouter(
    <>
      <Masthead user={shellUser} />
      <Dock user={shellUser} />
      <AppMenu user={shellUser} />
    </>,
    { path: "*", initialEntry: pathname },
  );
}

describe("activeTab", () => {
  it.each([
    ["/", "desks"],
    ["/admin", "admin"],
    ["/admin/people", "admin"],
    ["/reservations", "bookings"],
    ["/automatic-reservations", "bookings"],
    ["/metrics", "metrics"],
    ["/users/edit/emp042", undefined],
  ])("lights the parent tab for %s", (pathname, tab) => {
    expect(activeTab(pathname)).toBe(tab);
  });
});

describe("AppShell", () => {
  it("links the four places in both the masthead and the dock", () => {
    renderShell("/");

    for (let nav of screen.getAllByRole("navigation", { name: "Main" })) {
      expect(within(nav).getByRole("link", { name: "Desks" })).toHaveAttribute(
        "href",
        "/",
      );
      expect(
        within(nav).getByRole("link", { name: "Bookings" }),
      ).toHaveAttribute("href", "/reservations");
      expect(
        within(nav).getByRole("link", { name: "Metrics" }),
      ).toHaveAttribute("href", "/metrics");
      expect(within(nav).getByRole("link", { name: "Admin" })).toHaveAttribute(
        "href",
        "/admin",
      );
    }
  });

  it("shows the Admin tab to admins only", () => {
    renderShell("/", { ...user, role: "user" });

    for (let nav of screen.getAllByRole("navigation", { name: "Main" })) {
      expect(
        within(nav).queryByRole("link", { name: "Admin" }),
      ).not.toBeInTheDocument();
    }
  });

  it("marks the parent tab as current on a secondary page", () => {
    renderShell("/automatic-reservations");

    let current = screen.getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(2);
    for (let link of current) {
      expect(link).toHaveTextContent("Bookings");
    }
  });

  it("opens the same menu from the avatar and from You", () => {
    renderShell("/");

    let menu = document.getElementById("app-menu")!;
    expect(
      screen.getByRole("button", {
        name: "Account menu for Vaggelis Karavasileiadis",
      }),
    ).toHaveAttribute("popovertarget", "app-menu");
    expect(screen.getByRole("button", { name: "You" })).toHaveAttribute(
      "popovertarget",
      "app-menu",
    );
    expect(menu).toHaveTextContent("Desk 2.1.2 · admin");
  });

  it("lists the account links and sign out in the menu", () => {
    renderShell("/");

    let menu = within(document.getElementById("app-menu")!);
    expect(
      menu.getByRole("link", { name: "Edit profile", hidden: true }),
    ).toHaveAttribute("href", "/users/edit/emp042");
    // Booking lives in the desk sheet and recurring bookings on the
    // Bookings page, so neither has a menu entry.
    expect(
      menu.queryByRole("link", { name: "Book my desk", hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      menu.queryByRole("link", {
        name: "Automatic reservations",
        hidden: true,
      }),
    ).not.toBeInTheDocument();
    expect(
      menu
        .getByRole("button", { name: "Sign out", hidden: true })
        .closest("form"),
    ).toHaveAttribute("action", "/login/logout");
  });

  it("says so when the user has no desk", () => {
    renderShell("/", { ...user, role: "user", desk: null });

    expect(document.getElementById("app-menu")).toHaveTextContent("No desk");
  });

  it("brings the dock back when a page leaves with a text field focused", async () => {
    let { user: pointer } = renderWithRouter(
      <>
        <Routes>
          <Route
            path="/users/edit/emp042"
            element={
              <>
                <input aria-label="First name" />
                <Link to="/">Back to desks</Link>
              </>
            }
          />
          <Route path="*" element={null} />
        </Routes>
        <Dock user={user} />
      </>,
      { path: "*", initialEntry: "/users/edit/emp042" },
    );
    let dock = document.querySelector(".app-dock");

    await pointer.click(screen.getByLabelText("First name"));
    expect(dock).toHaveAttribute("data-hidden");

    // Like Back: the page changes while the field still has focus, and the
    // field goes with it without a focusout.
    await act(async () => screen.getByText("Back to desks").click());
    expect(dock).not.toHaveAttribute("data-hidden");
  });
});
