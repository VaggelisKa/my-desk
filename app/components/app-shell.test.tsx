import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../test/render-with-router";
import {
  activeTab,
  AppMenu,
  Dock,
  Masthead,
  PageHeading,
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
      <PageHeading />
      <Dock user={shellUser} />
      <AppMenu user={shellUser} />
    </>,
    { path: "*", initialEntry: pathname },
  );
}

describe("activeTab", () => {
  it.each([
    ["/", "desks"],
    ["/desks/12/edit", "desks"],
    ["/reserve", "desks"],
    ["/reserve/12", "desks"],
    ["/reservations", "bookings"],
    ["/automatic-reservations", "bookings"],
    ["/metrics", "metrics"],
    ["/users/edit/emp042", undefined],
  ])("lights the parent tab for %s", (pathname, tab) => {
    expect(activeTab(pathname)).toBe(tab);
  });
});

describe("AppShell", () => {
  it("links the three places in both the masthead and the dock", () => {
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
    }
  });

  it("marks the parent tab as current on a secondary page", () => {
    renderShell("/automatic-reservations");

    let current = screen.getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(2);
    for (let link of current) {
      expect(link).toHaveTextContent("Bookings");
    }
    expect(
      screen.getByRole("link", { name: "Back to Bookings" }),
    ).toHaveAttribute("href", "/reservations");
    expect(
      screen.getByRole("heading", { name: "Automatic reservations" }),
    ).toBeInTheDocument();
  });

  it("gives the desks page no extra heading, it draws its own", () => {
    renderShell("/");

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
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
    expect(
      menu.getByRole("link", { name: "Add reservation", hidden: true }),
    ).toHaveAttribute("href", "/reserve");
    expect(
      menu.getByRole("link", { name: "Automatic reservations", hidden: true }),
    ).toHaveAttribute("href", "/automatic-reservations");
    expect(
      menu
        .getByRole("button", { name: "Sign out", hidden: true })
        .closest("form"),
    ).toHaveAttribute("action", "/login/logout");
  });

  it("only offers reservation management to users with a desk", () => {
    renderShell("/", { ...user, role: "user", desk: null });

    let menu = within(document.getElementById("app-menu")!);
    expect(
      menu.queryByRole("link", { name: "Add reservation", hidden: true }),
    ).not.toBeInTheDocument();
    expect(
      menu.queryByRole("link", {
        name: "Automatic reservations",
        hidden: true,
      }),
    ).not.toBeInTheDocument();
    expect(document.getElementById("app-menu")).toHaveTextContent("No desk");
  });
});
