import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export let users = sqliteTable("users", {
  id: text("id").notNull().primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role", { enum: ["user", "admin"] }).default("user"),
});
