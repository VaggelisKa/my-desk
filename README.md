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
