import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the React Router plugin (which expects
// to own the build) isn't loaded while running unit tests.
// The office's clock, like the e2e suite: the desk sheet reads the time in
// Copenhagen, so tests that fake a local time mean office time.
process.env.TZ = "Europe/Copenhagen";

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
