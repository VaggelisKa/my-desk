import { type RouteConfig } from "@react-router/dev/routes";
import { remixRoutesOptionAdapter } from "@react-router/remix-routes-option-adapter";
import { flatRoutes } from "remix-flat-routes";

export default remixRoutesOptionAdapter((defineRoutes) =>
  flatRoutes("routes", defineRoutes, {
    // Unit tests live next to the route modules they cover.
    ignoredRouteFiles: ["**/*.test.{ts,tsx}"],
  }),
) satisfies RouteConfig;
