import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithRouter } from "../../test/render-with-router";
import { AppBreadcrumbs } from "./app-breadcrumbs";

function renderAt(pathname: string) {
  return renderWithRouter(<AppBreadcrumbs />, {
    path: "*",
    initialEntry: pathname,
  });
}

function currentPage() {
  return screen.getByRole("link", { current: "page" });
}

describe("AppBreadcrumbs", () => {
  it("shows only the desks page on the homepage", () => {
    renderAt("/");

    expect(currentPage()).toHaveTextContent("Desks");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it.each([
    ["/reservations", "My reservations"],
    ["/reserve/12", "Add reservation"],
    ["/automatic-reservations", "Automatic reservations"],
    ["/users/edit/user-1", "Edit your profile"],
    ["/desks/12/edit", "Edit desk"],
    ["/metrics", "Desk & booking metrics"],
  ])("labels %s as '%s' with a link back to the desks", (pathname, label) => {
    renderAt(pathname);

    expect(currentPage()).toHaveTextContent(label);
    expect(screen.getByRole("link", { name: "Desks" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
