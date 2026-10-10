import { relations, sql } from "drizzle-orm";
import {
  index,
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
  autoReservationsCronId: text("auto_reservations_cron_id"),
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
  (t) => [
    unique().on(t.block, t.row, t.column),
    index("idx_desks_user_id").on(t.userId),
  ],
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
  (t) => [
    primaryKey({
      columns: [t.deskId, t.day, t.week],
    }),
    index("idx_reservations_desk_id").on(t.deskId),
  ],
);

export let bookingMetrics = sqliteTable("booking_metrics", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  metricDate: text("metric_date", { mode: "text" }).notNull(),
  totalBookings: integer("total_bookings", { mode: "number" }).notNull(),
  totalGuestBookings: integer("total_guest_bookings", {
    mode: "number",
  }),
  participation_percentage: integer("participation_percentage", {
    mode: "number",
  }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

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

// Assistants (Claude, ChatGPT) that connect to the MCP server. Each registers
// itself once (OAuth dynamic client registration), then people sign in
// through it. Secrets, codes and tokens are stored as SHA-256 hashes only.
export let oauthClients = sqliteTable("oauth_clients", {
  id: text("id").notNull().primaryKey(),
  name: text("name").notNull(),
  /** JSON array of the exact redirect URIs the client registered. */
  redirectUris: text("redirect_uris").notNull(),
  /** Set for clients that authenticate at the token endpoint; null for public ones. */
  secretHash: text("secret_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/** Authorization codes: single use, a few minutes long, bound to PKCE. */
export let oauthCodes = sqliteTable("oauth_codes", {
  codeHash: text("code_hash").notNull().primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  /** What the person allowed: "desks", or "desks admin" for an Admin who ticked it. */
  scope: text("scope").notNull().default("desks"),
  expiresAt: integer("expires_at", { mode: "number" }).notNull(),
});

/**
 * Access and refresh tokens. One grant (a person allowing one client) keeps
 * its `grantId` across refreshes, so disconnecting removes all its tokens.
 */
export let oauthTokens = sqliteTable(
  "oauth_tokens",
  {
    tokenHash: text("token_hash").notNull().primaryKey(),
    kind: text("kind", { enum: ["access", "refresh"] }).notNull(),
    grantId: text("grant_id").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** The grant's scope, kept across refreshes. */
    scope: text("scope").notNull().default("desks"),
    expiresAt: integer("expires_at", { mode: "number" }).notNull(),
  },
  (t) => [index("idx_oauth_tokens_grant_id").on(t.grantId)],
);

/** Every change made through the MCP server, also what rate limits count. */
export let mcpAuditLog = sqliteTable(
  "mcp_audit_log",
  {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    clientId: text("client_id").notNull(),
    tool: text("tool").notNull(),
    /** The tool's arguments, as JSON. */
    input: text("input").notNull(),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    /** What the tool answered, in a sentence. */
    message: text("message").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("idx_mcp_audit_log_user_created").on(t.userId, t.createdAt)],
);
