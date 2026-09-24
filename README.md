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
SESSION_SECRET="paste-a-randomly-generated-secret-here"
```

the actual values for `DATABASE_AUTH_TOKEN` and `DATABASE_URL` can be obtained from the Turso dashboard (talk with admin).

After that is in place, you can just:

1. Install dependencies: `npm install`
2. Run the app: `npm run dev`

P.S Just be a bit careful when dealing with the database, as it's a shared resource and you can easily mess up the data for others.

## Authentication cookie configuration

Generate `SESSION_SECRET` with `openssl rand -hex 32` and save it in your local
`.env` or deployment secret store. It must contain at least 32 non-padding
characters. Never commit the generated value. Use a separate secret per environment,
shared by all instances in that environment; do not generate it at application startup.
The server refuses to initialize authentication when it is missing or too short.

Before deploying the signed-cookie change, set `SESSION_SECRET` in each applicable
Vercel environment (including preview deployments). Existing unsigned cookies are
rejected, so users must log in again. Changing the secret invalidates all existing
signed cookies; coordinate rotation across instances. Do not roll back to the
unsigned-cookie implementation.

Cookies contain only the user ID and a signed expiry, enforced by the server after
14 days. Names and roles are read from the database on every authenticated request,
so deleting a user or changing a role takes effect immediately. Logout clears the
browser cookie. These stateless cookies do not support individual server-side
revocation: a previously copied cookie remains valid until expiry or secret rotation
unless its user is deleted. Per-session revocation needs a separate session store.

This change prevents cookie tampering. Employee-ID-only login and registration's
existing-account fallback still do not prove account ownership and need a separate
identity-verification fix; signing does not resolve those login risks.

Run `npm test` for the unit suite, including the authentication regression tests.
The authentication tests use test-only keys and a mocked database, and require no
database or scheduler credentials.
