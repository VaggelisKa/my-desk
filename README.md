# Share a desk

## App description

This is a simple workspace management applications that allows users to book and reserve desks in a shared workspace.

## Tech stack

tl;dr:
This is a full-stack application build with [Remix](https://remix.run/docs/en/main) which is a react framework that allows for server-side rendering.

The app is hosted on [Vercel](https://vercel.com/) and is using [Turso](https://turso.tech/) as a serverless SQLite database provider.

Extras:

- [shadcn](https://ui.shadcn.com/) For UI components building on top of Radix.
- [TailwindCSS](https://tailwindcss.com/) for styling.
- [Drizzle](https://orm.drizzle.team/docs/overview) as ORM and for managing migrations, schemas etc.

## How to run

Before running the app, you need to create a `.env` file in the root of the project with the following content:

```bash
DATABASE_AUTH_TOKEN="paste-your-token-here"
DATABASE_URL="paste-your-database-url-here"
```

the actual values for `DATABASE_AUTH_TOKEN` and `DATABASE_URL` can be obtained from the Turso dashboard (talk with admin).

After that is in place, you can just:

1. Install dependencies: `npm install`
2. Run the app: `npm run dev`

P.S Just be a bit careful when dealing with the database, as it's a shared resource and you can easily mess up the data for others.

## Testing

- Unit tests: `npm test` (Vitest)
- End-to-end tests: `npm run test:e2e` (Playwright), or `npm run test:e2e:ui` for the interactive UI mode. Run `npx playwright install chromium` once beforehand.

The e2e suite never touches the shared Turso database or any third party service:

- Playwright starts its own dev server on port 5199 (override with `E2E_PORT`) against a throwaway SQLite file in `e2e/.tmp/`, built from the migrations in `database/`. Every test starts from the same seed (`e2e/support/db.ts`).
- `e2e/support/server-preload.mjs` is loaded into that server only. It refuses to start without a local `file:` database, stubs the cron-job.org API, and blocks every other outbound request.
- The server and browser clocks are both pinned to an upcoming Monday at 08:00 (Europe/Copenhagen), so date-dependent flows behave the same whatever day the suite runs.

Specs live in `e2e/`, one file per flow, with page objects in `e2e/pages/` and shared fixtures in `e2e/fixtures.ts`.
