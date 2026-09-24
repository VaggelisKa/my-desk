import {
  act,
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { createRoutesStub, Link, Outlet } from "react-router";
import { describe, expect, it } from "vitest";
import { NavigationProgress } from "./navigation-progress";

function renderWithSlowPage() {
  let finishLoading!: () => void;

  // Mirrors root.tsx, where the bar lives in the layout shared by all pages.
  function Layout() {
    return (
      <>
        <NavigationProgress />
        <Outlet />
      </>
    );
  }

  let Stub = createRoutesStub([
    {
      path: "/",
      Component: Layout,
      children: [
        {
          index: true,
          Component: () => <Link to="/slow">Go to slow page</Link>,
        },
        {
          path: "slow",
          Component: () => <p>Slow page</p>,
          loader: () =>
            new Promise((resolve) => (finishLoading = () => resolve(null))),
        },
      ],
    },
  ]);

  render(<Stub />);

  return { finishLoading: () => finishLoading() };
}

describe("NavigationProgress", () => {
  it("is not shown while the app is idle", () => {
    renderWithSlowPage();

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("shows while a navigation is pending and hides shortly after it completes", async () => {
    let { finishLoading } = renderWithSlowPage();

    await act(async () => {
      screen.getByRole("link", { name: "Go to slow page" }).click();
    });

    expect(
      screen.getByRole("progressbar", { name: "Loading page" }),
    ).toHaveAttribute("aria-valuetext", "Loading");

    await act(async () => {
      finishLoading();
    });

    expect(await screen.findByText("Slow page")).toBeInTheDocument();
    // Lingers briefly so the completion animation can play.
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "Done",
    );

    await waitForElementToBeRemoved(() => screen.queryByRole("progressbar"));
  });
});
