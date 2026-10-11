import {
  oauthHeaders,
  protectedResourceMetadata,
} from "~/lib/mcp/oauth.server";
import type { Route } from "./+types/[.well-known].oauth-protected-resource";

// Which authorization server guards the MCP endpoint (RFC 9728). The 401 from
// /mcp points here; clients that guess the path try this one too.
export function loader({ url }: Route.LoaderArgs) {
  return Response.json(protectedResourceMetadata(url.origin), {
    headers: oauthHeaders,
  });
}
