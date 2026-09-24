// Creates a fresh, fully migrated SQLite database for the e2e web server.
// Runs before the server starts, so the file is never replaced while it is open.
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { dirname } from "node:path";

let url = process.env.DATABASE_URL ?? "";
let port = Number(process.env.E2E_PORT);

if (!url.startsWith("file:")) {
  throw new Error(
    `[e2e] Refusing to prepare a non-local database (DATABASE_URL=${url || "<unset>"})`,
  );
}

// If the port is taken, another e2e server is most likely running against
// this very file. Bail out before deleting it from under that server.
await new Promise((resolve, reject) => {
  let probe = createServer()
    .once("error", () =>
      reject(
        new Error(
          `[e2e] Port ${port} is already in use. Stop the other server or set E2E_PORT.`,
        ),
      ),
    )
    .once("listening", () => probe.close(resolve))
    .listen(port);
});

let file = url.slice("file:".length);

for (let suffix of ["", "-wal", "-shm", "-journal"]) {
  rmSync(file + suffix, { force: true });
}
mkdirSync(dirname(file), { recursive: true });

if (process.env.E2E_CRON_LOG) {
  rmSync(process.env.E2E_CRON_LOG, { force: true });
}

let client = createClient({ url });
// WAL lets the test process and the server read and write concurrently
// without instantly failing with SQLITE_BUSY. It is stored in the file, so the
// server's connection picks it up too.
await client.execute("PRAGMA journal_mode = WAL");
await migrate(drizzle(client), { migrationsFolder: "database" });
client.close();

console.log(`[e2e] Prepared database at ${file}`);
