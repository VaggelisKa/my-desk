import { relations, sql } from "drizzle-orm";
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
    block: integer("block", { mode: "number" }).notNull(),
    column: integer("column", { mode: "number" }).notNull(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    uniqueRowAndColumnCombo: unique().on(t.block, t.row, t.column),
  }),
);

export let reservations = sqliteTable(
  "reservations",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    deskId: integer("desk_id", { mode: "number" }).references(() => desks.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    day: text("day").notNull(),
    week: integer("week", { mode: "number" }).notNull(),
    date: text("date"),
    dateTimestamp: integer("date_timestamp", { mode: "number" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    compositePrimaryKey: primaryKey({
      columns: [t.deskId, t.day, t.week],
    }),
  }),
);

// relations for query syntax

export let usersRelations = relations(users, ({ one, many }) => ({
  reservations: many(reservations),
  desk: one(desks, {
    fields: [users.id],
    references: [desks.userId],
  }),
}));

export let desksRelations = relations(desks, ({ one, many }) => ({
  reservations: many(reservations),
  user: one(users, {
    fields: [desks.userId],
    references: [users.id],
  }),
}));

export let reservationsRelations = relations(reservations, ({ one }) => ({
  users: one(users, {
    fields: [reservations.userId],
    references: [users.id],
  }),
  desks: one(desks, {
    fields: [reservations.deskId],
    references: [desks.id],
  }),
}));
