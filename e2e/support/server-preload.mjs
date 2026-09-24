// Preloaded into the e2e web server with `node --import`. It never ships with
// the app; it only stubs the things the server would otherwise reach out to.
import { appendFileSync } from "node:fs";

// 1. Never talk to a real database.
if (!process.env.DATABASE_URL?.startsWith("file:")) {
  throw new Error(
    "[e2e] The e2e server must run against a local file database. Refusing to start.",
  );
}

// 2. Pin the server clock to the same "now" the browser uses. Time keeps
// flowing from that instant so timers and durations behave normally.
if (!process.env.E2E_NOW) {
  throw new Error("[e2e] E2E_NOW is not set. Refusing to start.");
}

let RealDate = Date;
let pinnedNow = RealDate.parse(process.env.E2E_NOW);
let startedAt = RealDate.now();
// Wrap around every 2 hours so a long-lived server (e.g. UI mode) never drifts
// past the 11:00 cut-off after which a day can no longer be booked.
let wrapAfter = 2 * 60 * 60 * 1000;

function now() {
  return pinnedNow + ((RealDate.now() - startedAt) % wrapAfter);
}

class E2EDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      super(now());
    } else {
      super(...args);
    }
  }

  static now() {
    return now();
  }

  // Keep `instanceof Date` true for dates created before the swap or by
  // native code (fs stats, structuredClone).
  static [Symbol.hasInstance](value) {
    return value instanceof RealDate;
  }
}

// `Date()` called without `new` returns a string instead of throwing.
globalThis.Date = new Proxy(E2EDate, {
  apply: () => new E2EDate().toString(),
});

// 3. Stub third party APIs and block every other outbound request, so a test
// can never create, pause or delete real cron jobs.
let realFetch = globalThis.fetch;
let localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
let nextCronJobId = 900_000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cronJobOrgMock(url, method) {
  // Tests read this log to assert which cron jobs the app touched.
  if (process.env.E2E_CRON_LOG) {
    appendFileSync(
      process.env.E2E_CRON_LOG,
      JSON.stringify({ method, path: url.pathname }) + "\n",
    );
  }

  if (method === "PUT" && url.pathname === "/jobs") {
    return json({ jobId: nextCronJobId++ });
  }

  if (method === "GET" && url.pathname.startsWith("/jobs/")) {
    return json({ jobDetails: { enabled: true } });
  }

  if (
    (method === "PATCH" || method === "DELETE") &&
    url.pathname.startsWith("/jobs/")
  ) {
    return json({});
  }

  return json({ error: "Not mocked" }, 404);
}

globalThis.fetch = async (input, init) => {
  let request = input instanceof Request ? input : null;
  let url = new URL(request ? request.url : String(input));
  let method = (init?.method ?? request?.method ?? "GET").toUpperCase();

  if (url.hostname === "api.cron-job.org") {
    return cronJobOrgMock(url, method);
  }

  if (localHosts.has(url.hostname)) {
    return realFetch(input, init);
  }

  throw new Error(`[e2e] Blocked outbound request: ${method} ${url.href}`);
};

console.log(
  `[e2e] Server preload active in pid ${process.pid}: clock pinned to ${process.env.E2E_NOW}, outbound requests stubbed`,
);
