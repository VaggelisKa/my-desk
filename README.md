# Share a desk

Book desks in a shared workspace. Built with React Router, Drizzle, shadcn/ui and
Tailwind CSS; hosted on Vercel with a Turso database.

## Development

Create `.env` with database credentials from your admin and a session secret generated
with `openssl rand -hex 32`:

```dotenv
DATABASE_URL="your-database-url"
DATABASE_AUTH_TOKEN="your-database-token"
SESSION_SECRET="your-generated-secret"
```

```sh
npm ci
npm run dev
```

The database is shared: use isolated test data for changes that write or delete records.
Never commit credentials.

## Checks

```sh
npm test
npm run test:e2e
npm run typecheck
npm run doctor
npm run build
```

CI also fails when the React Doctor score is 80 or below.

Authentication tests mock the database and need no service credentials.

## Session configuration

Set `SESSION_SECRET` before deploying to each Vercel environment, including previews.
Use a separate random secret per environment, shared across its instances. Missing
secrets or values shorter than 32 characters prevent authentication startup.

Signed cookies expire after 14 days; roles are checked against the database on every
request. Deployment rejects old unsigned cookies, and rotating the secret signs
everyone out. Logout clears the browser cookie but cannot revoke a stolen copy
before expiry; deleting its user or rotating the secret invalidates it.

Employee-ID-only login and registration's existing-account fallback still need
identity verification. Cookie signing does not resolve those separate risks.

## Testing

- Unit tests: `npm test` (Vitest)
- End-to-end tests: `npm run test:e2e` (Playwright), or `npm run test:e2e:ui` for the interactive UI mode. Run `npx playwright install chromium` once beforehand.

The e2e suite never touches the shared Turso database or any third party service:

- Playwright starts its own dev server on port 5199 (override with `E2E_PORT`) against a throwaway SQLite file in `e2e/.tmp/`, built from the migrations in `database/`. Every test starts from the same seed (`e2e/support/db.ts`).
- `e2e/support/server-preload.mjs` is loaded into that server only. It refuses to start without a local `file:` database, stubs the cron-job.org API, and blocks every other outbound request.
- The server and browser clocks are both pinned to an upcoming Monday at 08:00 (Europe/Copenhagen), so date-dependent flows behave the same whatever day the suite runs.

Specs live in `e2e/`, one file per flow, with page objects in `e2e/pages/` and shared fixtures in `e2e/fixtures.ts`.
