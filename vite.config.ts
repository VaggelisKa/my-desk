import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";

/**
 * Bundles the server's dependencies into one file, so a cold start doesn't
 * load hundreds of files from node_modules. libsql stays external for its
 * native binary. React Router builds the server in its own environments,
 * which the top-level `ssr.noExternal` doesn't reach.
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
  plugins: [bundleServerDependencies(), reactRouter()],
});
