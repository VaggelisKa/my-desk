import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the React Router plugin (which expects
// to own the build) isn't loaded while running unit tests.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["app/**/*.test.{ts,tsx}"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
