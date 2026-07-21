import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    emailHash: text("email_hash").notNull(),
    role: text("role", { enum: ["patient", "therapist"] }).notNull(),
    status: text("status", { enum: ["pending_mfa", "active", "disabled"] }).notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordIterations: integer("password_iterations").notNull(),
    recoverySalt: text("recovery_salt").notNull(),
    recoveryHash: text("recovery_hash").notNull(),
    totpSecret: text("totp_secret"),
    totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
    lastTotpCounter: integer("last_totp_counter"),
    privacyVersion: text("privacy_version").notNull(),
    adultConfirmedAt: text("adult_confirmed_at"),
    createdAt: text("created_at").notNull(),
    lastLoginAt: text("last_login_at"),
  },
  (table) => [
    uniqueIndex("users_email_hash_idx").on(table.emailHash),
    index("users_role_status_idx").on(table.role, table.status),
  ],
);

export const patientLinks = sqliteTable(
  "patient_links",
  {
    id: text("id").primaryKey(),
    therapistId: text("therapist_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    patientId: text("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["active", "closed"] }).notNull(),
    createdAt: text("created_at").notNull(),
    closedAt: text("closed_at"),
  },
  (table) => [
    uniqueIndex("patient_links_unique_idx").on(table.therapistId, table.patientId),
    index("patient_links_patient_idx").on(table.patientId, table.status),
  ],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull(),
    therapistId: text("therapist_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    usedAt: text("used_at"),
    patientId: text("patient_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("invitations_code_hash_idx").on(table.codeHash),
    index("invitations_therapist_idx").on(table.therapistId, table.createdAt),
  ],
);

export const entries = sqliteTable(
  "entries",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    happened: text("happened").notNull(),
    body: text("body").notNull().default(""),
    thoughts: text("thoughts").notNull().default(""),
    urge: text("urge").notNull().default(""),
    emotion: text("emotion").notNull().default(""),
    intensity: integer("intensity").notNull().default(0),
    message: text("message").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    sharedAt: text("shared_at"),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    index("entries_patient_created_idx").on(table.patientId, table.createdAt),
    index("entries_shared_idx").on(table.sharedAt, table.revokedAt),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    csrfToken: text("csrf_token").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [index("sessions_user_idx").on(table.userId), index("sessions_expiry_idx").on(table.expiresAt)],
);

export const accessLogs = sqliteTable(
  "access_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("access_logs_user_created_idx").on(table.userId, table.createdAt)],
);

export const authWindows = sqliteTable("auth_windows", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStartedAt: text("window_started_at").notNull(),
});

export const systemConfig = sqliteTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
