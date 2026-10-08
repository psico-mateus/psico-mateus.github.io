import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

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
    mfaRecoverySetId: text("mfa_recovery_set_id"),
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

export const patientNotices = sqliteTable(
  "patient_notices",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    therapistId: text("therapist_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull(),
    readAt: text("read_at"),
    clientRequestId: text("client_request_id"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("patient_notices_request_idx").on(table.therapistId, table.patientId, table.clientRequestId),
    index("patient_notices_patient_created_idx").on(table.patientId, table.deletedAt, table.createdAt, table.id),
    index("patient_notices_therapist_patient_created_idx").on(table.therapistId, table.patientId, table.createdAt),
    check("patient_notices_content_check", sql`(${table.deletedAt} IS NULL AND length(${table.title}) BETWEEN 1 AND 100 AND length(${table.body}) BETWEEN 1 AND 2000) OR (${table.deletedAt} IS NOT NULL AND ${table.title} = '' AND ${table.body} = '')`),
    check("patient_notices_request_id_check", sql`${table.clientRequestId} IS NULL OR length(${table.clientRequestId}) BETWEEN 16 AND 80`),
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

/**
 * Continuação opcional e individual de um Registro.
 *
 * A revisão herda a propriedade e o compartilhamento do Registro por meio da
 * chave estrangeira 1:1. Não há rota profissional direta para esta tabela.
 */
export const entryThoughtReviews = sqliteTable(
  "entry_thought_reviews",
  {
    entryId: text("entry_id")
      .primaryKey()
      .references(() => entries.id, { onDelete: "cascade" }),
    sourceThought: text("source_thought").notNull(),
    supportingContext: text("supporting_context").notNull().default(""),
    missingContext: text("missing_context").notNull().default(""),
    alternativeView: text("alternative_view").notNull().default(""),
    currentView: text("current_view").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "entry_thought_reviews_source_thought_check",
      sql`length(${table.sourceThought}) BETWEEN 1 AND 1500`,
    ),
    check(
      "entry_thought_reviews_supporting_context_check",
      sql`length(${table.supportingContext}) <= 1500`,
    ),
    check(
      "entry_thought_reviews_missing_context_check",
      sql`length(${table.missingContext}) <= 1500`,
    ),
    check(
      "entry_thought_reviews_alternative_view_check",
      sql`length(${table.alternativeView}) <= 1500`,
    ),
    check(
      "entry_thought_reviews_current_view_check",
      sql`length(${table.currentView}) <= 1500`,
    ),
    check("entry_thought_reviews_revision_check", sql`${table.revision} >= 1`),
  ],
);

/**
 * Rascunho privado e versionado do "Meu mapa".
 *
 * A linha `state/__state__` guarda a geração atual. As demais linhas guardam
 * um campo por vez; `value = NULL` é um tombstone. O profissional não possui
 * relação nem rota de leitura para esta tabela.
 */
export const patientMapDraftFields = sqliteTable(
  "patient_map_draft_fields",
  {
    patientId: text("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contentVersion: text("content_version").notNull(),
    fieldType: text("field_type", {
      enum: ["state", "answer", "position", "synthesis"],
    }).notNull(),
    fieldId: text("field_id").notNull(),
    generation: integer("generation").notNull(),
    value: text("value"),
    revision: integer("revision").notNull().default(0),
    requestId: text("request_id").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.patientId,
        table.contentVersion,
        table.fieldType,
        table.fieldId,
      ],
      name: "patient_map_draft_fields_pk",
    }),
    uniqueIndex("patient_map_draft_request_idx")
      .on(
        table.patientId,
        table.contentVersion,
        table.generation,
        table.requestId,
      )
      .where(sql`${table.requestId} <> ''`),
    check(
      "patient_map_draft_field_type_check",
      sql`${table.fieldType} IN ('state', 'answer', 'position', 'synthesis')`,
    ),
    check(
      "patient_map_draft_content_version_check",
      sql`length(${table.contentVersion}) BETWEEN 1 AND 80`,
    ),
    check(
      "patient_map_draft_field_id_check",
      sql`length(${table.fieldId}) BETWEEN 1 AND 80`,
    ),
    check("patient_map_draft_generation_check", sql`${table.generation} >= 1`),
    check(
      "patient_map_draft_value_check",
      sql`${table.value} IS NULL OR length(${table.value}) <= 4096`,
    ),
    check("patient_map_draft_revision_check", sql`${table.revision} >= 0`),
    check(
      "patient_map_draft_request_id_check",
      sql`(${table.fieldType} = 'state' AND (${table.requestId} = '' OR length(${table.requestId}) BETWEEN 16 AND 80))
        OR (${table.fieldType} <> 'state' AND length(${table.requestId}) BETWEEN 16 AND 80)`,
    ),
    check(
      "patient_map_draft_state_shape_check",
      sql`(${table.fieldType} = 'state' AND ${table.fieldId} = '__state__' AND ${table.value} IS NULL)
        OR (${table.fieldType} <> 'state' AND ${table.fieldId} <> '__state__')`,
    ),
  ],
);

/**
 * Retrato voluntariamente compartilhado de uma parte do "Meu mapa".
 *
 * O rascunho continua privado. Ao compartilhar, o servidor cria uma cópia
 * somente da parte escolhida; retirar o compartilhamento apaga essa cópia.
 */
export const patientMapShares = sqliteTable(
  "patient_map_shares",
  {
    patientId: text("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    therapistId: text("therapist_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mapId: text("map_id").notNull(),
    contentVersion: text("content_version").notNull(),
    snapshot: text("snapshot").notNull(),
    sharedAt: text("shared_at").notNull(),
    viewedAt: text("viewed_at"),
  },
  (table) => [
    primaryKey({
      columns: [table.patientId, table.mapId],
      name: "patient_map_shares_pk",
    }),
    index("patient_map_shares_therapist_idx").on(
      table.therapistId,
      table.sharedAt,
    ),
    check(
      "patient_map_shares_map_id_check",
      sql`length(${table.mapId}) BETWEEN 1 AND 80`,
    ),
    check(
      "patient_map_shares_content_version_check",
      sql`length(${table.contentVersion}) BETWEEN 1 AND 80`,
    ),
    check(
      "patient_map_shares_snapshot_check",
      sql`length(${table.snapshot}) BETWEEN 2 AND 65536`,
    ),
  ],
);

export const entryViews = sqliteTable(
  "entry_views",
  {
    entryId: text("entry_id").notNull().references(() => entries.id, { onDelete: "cascade" }),
    therapistId: text("therapist_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    viewedAt: text("viewed_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.entryId, table.therapistId],
      name: "entry_views_pk",
    }),
    index("entry_views_therapist_idx").on(table.therapistId, table.viewedAt),
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

/**
 * Códigos emergenciais exclusivos do MFA profissional.
 *
 * O texto entregue ao profissional nunca é persistido. `codeHash` guarda
 * somente um HMAC vinculado ao usuário; `mfaRecoverySetId` em `users` aponta
 * para o conjunto vigente e torna todos os conjuntos anteriores inválidos.
 */
export const professionalMfaRecoveryCodes = sqliteTable(
  "professional_mfa_recovery_codes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    setId: text("set_id").notNull(),
    position: integer("position").notNull(),
    codeHash: text("code_hash").notNull(),
    createdAt: text("created_at").notNull(),
    usedAt: text("used_at"),
    invalidatedAt: text("invalidated_at"),
    consumptionNonce: text("consumption_nonce"),
  },
  (table) => [
    uniqueIndex("professional_mfa_recovery_codes_hash_idx").on(table.codeHash),
    uniqueIndex("professional_mfa_recovery_codes_set_position_idx").on(
      table.setId,
      table.position,
    ),
    uniqueIndex("professional_mfa_recovery_codes_consumption_nonce_idx")
      .on(table.consumptionNonce)
      .where(sql`${table.consumptionNonce} IS NOT NULL`),
    index("professional_mfa_recovery_codes_user_status_idx").on(
      table.userId,
      table.setId,
      table.usedAt,
      table.invalidatedAt,
    ),
    check(
      "professional_mfa_recovery_codes_position_check",
      sql`${table.position} BETWEEN 1 AND 8`,
    ),
  ],
);

export const assistedRecoveryGrants = sqliteTable(
  "assisted_recovery_grants",
  {
    userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    issuedBy: text("issued_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("assisted_recovery_expiry_idx").on(table.expiresAt)],
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
