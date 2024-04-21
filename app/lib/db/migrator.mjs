import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";

dotenv.config({ path: `.env` });

(async () => {
  try {
    let client = createClient({
      url: process.env.DATABASE_URL,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });

    let db = drizzle(client);

    await migrate(db, { migrationsFolder: "database" });

    process.exit(0);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(error);

    process.exit(1);
  }
})();
