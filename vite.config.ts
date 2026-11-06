import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";

/**
 * Bundles the server's dependencies into the server build, as one file.
 *
 * Left external, every cold start of the Vercel function loads them from
 * node_modules file by file: date-fns alone is some 250 files, and the whole
 * start took about 1.9 s of CPU. Bundled and tree-shaken it takes about 0.3 s.
 * The libsql client stays external: it loads a native binary per platform.
 *
 * React Router names one server environment per server bundle, so the
 * top-level `ssr.noExternal` never reaches them; this sets it on each.
 * Build only, so `react-router dev` (and the e2e tests on it) is unchanged.
 */
function bundleServerDependencies(): Plugin {
  return {
    name: "bundle-server-dependencies",
    apply: "build",
    configEnvironment(name) {
      if (name === "client") return;
      return { resolve: { noExternal: true, external: ["@libsql/client"] } };
    },
  };
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // First, so React Router's plugin sees `noExternal: true` when it sets up
  // the same environments.
  plugins: [bundleServerDependencies(), reactRouter()],
});
