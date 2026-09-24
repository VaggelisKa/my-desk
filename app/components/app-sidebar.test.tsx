import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";
import { renderWithRouter } from "../../test/render-with-router";
import { AppSidebar } from "./app-sidebar";

function renderSidebar({
  deskId,
  pathname = "/",
}: { deskId?: number; pathname?: string } = {}) {
  return renderWithRouter(
    <SidebarProvider>
      <AppSidebar deskId={deskId} userId="user-1" />
      <SidebarTrigger />
    </SidebarProvider>,
    { path: "*", initialEntry: pathname },
  );
}

describe("AppSidebar", () => {
  it("links to the main pages and the user's profile", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "Homepage" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Metrics" })).toHaveAttribute(
      "href",
      "/metrics",
    );
    expect(
      screen.getByRole("link", { name: "My reservations" }),
    ).toHaveAttribute("href", "/reservations");
    expect(screen.getByRole("link", { name: "Edit profile" })).toHaveAttribute(
      "href",
      "/users/edit/user-1",
    );
  });

  it("only offers reservation management to users with an assigned desk", () => {
    renderSidebar();

    expect(
      screen.queryByRole("link", { name: "Add reservation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Automatic reservations" }),
    ).not.toBeInTheDocument();

    renderSidebar({ deskId: 12 });

    expect(
      screen.getByRole("link", { name: "Add reservation" }),
    ).toHaveAttribute("href", "/reserve");
    expect(
      screen.getByRole("link", { name: "Automatic reservations" }),
    ).toHaveAttribute("href", "/automatic-reservations");
  });

  it("marks the link for the current page as active", () => {
    renderSidebar({ pathname: "/metrics" });

    expect(screen.getByRole("link", { name: "Metrics" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Homepage" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("logs out by posting to the logout route", () => {
    renderSidebar();

    let form = screen.getByRole("button", { name: "Logout" }).closest("form");
    expect(form).toHaveAttribute("method", "POST");
    expect(form).toHaveAttribute("action", "/login/logout");
  });

  describe("on mobile", () => {
    function renderMobileSidebar() {
      vi.stubGlobal("innerWidth", 500);
      return renderSidebar({ deskId: 12 });
    }

    it("closes after navigating to a page", async () => {
      let { user } = renderMobileSidebar();

      await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
      let sidebar = await screen.findByRole("dialog", { name: "Sidebar" });

      // The menu button fills the link, so that's what a tap lands on.
      await user.click(screen.getByRole("button", { name: "Metrics" }));

      await waitFor(() => expect(sidebar).not.toBeInTheDocument());
    });

    it("can be closed with the close button", async () => {
      let { user } = renderMobileSidebar();

      await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
      let sidebar = await screen.findByRole("dialog", { name: "Sidebar" });

      await user.click(screen.getByRole("button", { name: "Close sidebar" }));

      await waitFor(() => expect(sidebar).not.toBeInTheDocument());
    });
  });
});
