import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  ssr: true,
  presets: [vercelPreset()],
  future: {
    unstable_viteEnvironmentApi: true,
    unstable_splitRouteModules: true,
  },
} satisfies Config;
