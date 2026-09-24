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
npm run typecheck
npm run build
```

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
