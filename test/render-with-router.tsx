import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";

type StubRoutes = Parameters<typeof createRoutesStub>[0];
type StubRoute = StubRoutes[number];

/**
 * Renders `ui` as the element of the route at `path`, alongside any extra
 * `routes` (e.g. actions that forms and fetchers submit to).
 */
export function renderWithRouter(
  ui: React.ReactNode,
  {
    path = "/",
    initialEntry = path,
    action,
    routes = [],
  }: {
    path?: string;
    initialEntry?: string;
    action?: StubRoute["action"];
    routes?: StubRoutes;
  } = {},
) {
  let Stub = createRoutesStub([
    { path, action, Component: () => <>{ui}</> },
    ...routes,
  ]);

  return {
    user: userEvent.setup(),
    ...render(<Stub initialEntries={[initialEntry]} />),
  };
}
