import {
  addDays,
  addWeeks,
  getWeek,
  getYear,
  setHours,
  startOfDay,
} from "date-fns";

// Everything date related in the app (bookable days, "today", week numbers) is
// computed with the local timezone, so the test runner, the dev server and the
// browser all have to agree on one.
export const TIMEZONE = "Europe/Copenhagen";
process.env.TZ = TIMEZONE;

// Override with E2E_PORT to run several checkouts side by side; the database
// and logs are per port, so the runs never share state.
export const PORT = Number(process.env.E2E_PORT ?? 5199);
export const BASE_URL = `http://localhost:${PORT}`;

// Relative `file:` URL resolved from the repo root, which is the cwd of both
// the Playwright runner and the web server.
export const DATABASE_FILE = `e2e/.tmp/e2e-${PORT}.db`;
export const DATABASE_URL = `file:${DATABASE_FILE}`;

// Every call the server makes to the stubbed cron-job.org API, one JSON per line.
export const CRON_LOG_FILE = `e2e/.tmp/cron-calls-${PORT}.jsonl`;

/**
 * The moment the app believes "now" is, on both the server and the browser.
 *
 * It is always a Monday at 08:00, so every weekday of the current week is still
 * bookable (the app closes a day at 11:00 on that day) and "today" is a
 * weekday. It is the *upcoming* Monday rather than a fixed calendar date so the
 * auth cookie (2 week max-age, computed from the fake clock) is never already
 * expired in the browser's real-time cookie jar. Weeks that touch a year
 * boundary are skipped, since the app's week-number math does not support them.
 */
function computeNow() {
  let today = startOfDay(new Date());
  let monday = addDays(today, (8 - today.getDay()) % 7 || 7);

  while (
    getWeek(monday) >= 51 ||
    getYear(addWeeks(monday, 1)) !== getYear(monday)
  ) {
    monday = addWeeks(monday, 1);
  }

  return setHours(monday, 8);
}

// The config module is evaluated by the runner and again by every worker, so
// the value is pinned in the environment (which workers and the web server
// inherit) to keep all processes on the exact same instant.
process.env.E2E_NOW ??= computeNow().toISOString();

export const NOW = new Date(process.env.E2E_NOW);
