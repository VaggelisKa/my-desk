import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  ssr: true,
  // The whole route map ships with the first page (it is small), so the
  // first tap on a tab does not wait on a /__manifest request.
  routeDiscovery: { mode: "initial" },
  presets: [vercelPreset()],
} satisfies Config;
