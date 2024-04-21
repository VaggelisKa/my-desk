import {
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

export let users = sqliteTable("users", {
  id: text("id").notNull().primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role", { enum: ["user", "admin"] }).default("user"),
});

export let desks = sqliteTable(
  "desks",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    row: integer("row", { mode: "number" }).notNull(),
    column: integer("column", { mode: "number" }).notNull(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    uniqueRowAndColumnCombo: unique().on(t.row, t.column),
  }),
);

export let reservations = sqliteTable(
  "reservations",
  {
    userId: text("user_id").notNull(),
    deskId: integer("desk_id", { mode: "number" }),
    day: text("day").notNull(),
    week: integer("week", { mode: "number" }).notNull(),
  },
  (t) => ({
    compositePrimaryKey: primaryKey({ columns: [t.deskId, t.userId] }),
  }),
);
