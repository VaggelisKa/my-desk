import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  ssr: true,
  presets: [vercelPreset()],
  future: {
    v8_viteEnvironmentApi: true,
    v8_splitRouteModules: true,
  },
} satisfies Config;
