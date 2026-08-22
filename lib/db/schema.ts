import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  timestamp,
  date,
  integer,
  unique,
  boolean,
  foreignKey,
  index,
  uniqueIndex,
  decimal,
  bigint,
  PgColumn,
  PgTableWithColumns,
  AnyPgColumn,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Marca blanca / Resellers
// ---------------------------------------------------------------------------

export const resellers = pgTable("resellers", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  slug: varchar("slug", { length: 64 }).notNull(),
  companyName: varchar("company_name", { length: 120 }).notNull(),
  /** active | past_due | suspended. past_due bloquea altas nuevas sin romper a los clientes vivos. */
  status: varchar("status", { length: 20 }).notNull().default("active"),
  /** Basis points de descuento sobre plans.amount: 3000 = 30% off. */
  wholesaleDiscountBps: integer("wholesale_discount_bps").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  lowBalanceThreshold: integer("low_balance_threshold").notNull().default(0),
  /** Rollout gradual del cobro con las credenciales propias del reseller. */
  paymentsEnabled: boolean("payments_enabled").notNull().default(false),
  /** Permite <script> en su landing. Equivale a darle ejecución de JS sobre el origen del login. */
  allowUnsafeHtml: boolean("allow_unsafe_html").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const resellerDomains = pgTable("reseller_domains", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id")
    .notNull()
    .references(() => resellers.id, { onDelete: "cascade" }),
  hostname: varchar("hostname", { length: 253 }).notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  /** pending | active | disabled. Solo los active resuelven tenant. */
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  verificationToken: varchar("verification_token", { length: 64 }),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const resellerPlanPrices = pgTable("reseller_plan_prices", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id")
    .notNull()
    .references(() => resellers.id, { onDelete: "cascade" }),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  isPublished: boolean("is_published").notNull().default(true),
  /** Centavos: lo que el reseller le cobra a su cliente. */
  retailAmount: integer("retail_amount").notNull(),
  /** NULL => se deriva de resellers.wholesaleDiscountBps. */
  wholesaleAmount: integer("wholesale_amount"),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  /** Ids en la cuenta de pago DEL RESELLER, no en la de la plataforma. */
  externalProductRef: text("external_product_ref"),
  externalPriceRef: text("external_price_ref"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const resellerWallets = pgTable("reseller_wallets", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id")
    .notNull()
    .unique()
    .references(() => resellers.id, { onDelete: "cascade" }),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  balance: integer("balance").notNull().default(0),
  /**
   * Permite saldo negativo hasta -creditLimit. No hay CHECK en BD (se quitó en 0051):
   * una renovación ya pagada por el cliente final debe activarse aunque sobregire, y
   * eso la BD no lo puede distinguir. La invariante la impone debitWallet().
   */
  creditLimit: integer("credit_limit").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id")
    .notNull()
    .references(() => resellerWallets.id, { onDelete: "cascade" }),
  resellerId: integer("reseller_id")
    .notNull()
    .references(() => resellers.id, { onDelete: "cascade" }),
  /** topup | debit_plan | refund | adjustment | chargeback */
  type: varchar("type", { length: 24 }).notNull(),
  /** completed | pending_debt | reversed */
  status: varchar("status", { length: 20 }).notNull().default("completed"),
  /** (+) acredita, (-) debita. */
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  teamId: integer("team_id").references(() => teams.id, {
    onDelete: "set null",
  }),
  planId: integer("plan_id").references(() => plans.id, {
    onDelete: "set null",
  }),
  /**
   * Única defensa contra el doble cobro: el alta por Stripe pasa por el checkout
   * route y por el webhook, y ambos comparten esta clave.
   */
  idempotencyKey: varchar("idempotency_key", { length: 191 }).notNull(),
  provider: varchar("provider", { length: 50 }),
  providerRef: varchar("provider_ref", { length: 191 }),
  description: text("description"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const resellerTopups = pgTable("reseller_topups", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id")
    .notNull()
    .references(() => resellers.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  /** Pasarela de la PLATAFORMA: el reseller le paga a la plataforma. */
  provider: varchar("provider", { length: 50 }).notNull(),
  providerRef: varchar("provider_ref", { length: 191 }),
  /** pending | pending_manual_review | paid | rejected | failed */
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  proofUrl: text("proof_url"),
  reviewedBy: integer("reviewed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedAt: timestamp("reviewed_at"),
  walletTransactionId: integer("wallet_transaction_id").references(
    () => walletTransactions.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** admin | owner | member | reseller. Ver USER_ROLES en lib/auth/roles.ts. */
  role: varchar("role", { length: 20 }).notNull().default("member"),
  /** Reseller que captó a este usuario. Para atribución; la facturación mira teams.resellerId. */
  resellerId: integer("reseller_id").references((): any => resellers.id, {
    onDelete: "set null",
  }),
  enableSignature: boolean("enable_signature").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

/**
 * Auditoría durable de cambios administrativos sobre un reseller. No usa
 * activity_logs porque esos eventos exigen team_id y un reseller existe antes
 * de tener clientes/equipos.
 */
export const resellerAuditEvents = pgTable(
  "reseller_audit_events",
  {
    id: serial("id").primaryKey(),
    resellerId: integer("reseller_id").references(() => resellers.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 80 }).notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    previousOwnerUserId: integer("previous_owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    nextOwnerUserId: integer("next_owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    resellerCreatedIdx: index("reseller_audit_events_reseller_created_idx").on(
      table.resellerId,
      table.createdAt,
    ),
    actorCreatedIdx: index("reseller_audit_events_actor_created_idx").on(
      table.actorUserId,
      table.createdAt,
    ),
  }),
);

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),

  stripeProductId: text("stripe_product_id").notNull(),
  stripePriceId: text("stripe_price_id").notNull(),
  amount: integer("amount").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  interval: varchar("interval", { length: 20 }).notNull().default("month"),
  trialDays: integer("trial_days").notNull().default(0),

  maxUsers: integer("max_users").notNull().default(1),
  maxContacts: integer("max_contacts").notNull().default(1000),
  maxInstances: integer("max_instances").notNull().default(1),

  isAiEnabled: boolean("is_ai_enabled").notNull().default(false),
  isFlowBuilderEnabled: boolean("is_flow_builder_enabled")
    .notNull()
    .default(false),
  isCampaignsEnabled: boolean("is_campaigns_enabled").notNull().default(false),
  isTemplatesEnabled: boolean("is_templates_enabled").notNull().default(false),
  isSocialPublisherEnabled: boolean("is_social_publisher_enabled").notNull().default(false),
  pricingCustomItems: jsonb("pricing_custom_items")
    .$type<Array<{ text: string; included: boolean }>>()
    .notNull()
    .default([]),

  isHidden: boolean("is_hidden").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  planId: integer("plan_id").references(() => plans.id),
  /**
   * Fuente de verdad de la facturación: de aquí sale a quién se le debita el
   * mayorista. El cobro nunca mira el host del request — un cliente de un
   * reseller que entre por el dominio de la plataforma sigue siendo suyo.
   */
  resellerId: integer("reseller_id").references((): any => resellers.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripeProductId: text("stripe_product_id"),
  planName: varchar("plan_name", { length: 50 }),
  subscriptionStatus: varchar("subscription_status", { length: 20 }),
  isCanceled: boolean("is_canceled").default(false),
  trialEndsAt: timestamp("trial_ends_at"),
});

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).notNull(),
  permissions:
    jsonb("permissions").$type<import("@/lib/permissions").MemberPermissions>(),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  action: text("action").notNull(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
});

export const invitations = pgTable("invitations", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  invitedBy: integer("invited_by")
    .notNull()
    .references(() => users.id),
  invitedAt: timestamp("invited_at").notNull().defaultNow(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
});

export const chats = pgTable(
  "chats",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    instanceId: integer("instance_id").references(() => evolutionInstances.id, {
      onDelete: "set null",
    }),
    remoteJid: text("remote_jid").notNull(),

    name: text("name"),
    pushName: text("push_name"),
    profilePicUrl: text("profile_pic_url"),
    lastMessageText: text("last_message_text"),
    lastMessageTimestamp: timestamp("last_message_timestamp"),
    lastCustomerInteraction: timestamp("last_customer_interaction"),
    unreadCount: integer("unread_count").default(0),
    lastMessageStatus: varchar("last_message_status", { length: 20 }),
    lastMessageFromMe: boolean("last_message_from_me"),
    // When true, automations must NOT auto-trigger for this chat (set when an
    // operator manually closes/cuts the chat). Reset when an automation is
    // triggered manually again.
    automationDisabled: boolean("automation_disabled").default(false),
  },
  (self) => ({
    teamChatInstanceUnique: unique("team_chat_instance_idx").on(
      self.teamId,
      self.remoteJid,
      self.instanceId,
    ),
    teamLastMessageIndex: index("chats_team_last_message_idx").on(
      self.teamId,
      self.lastMessageTimestamp,
    ),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    fromMe: boolean("from_me").notNull(),
    messageType: text("message_type"),
    text: text("text"),
    mediaUrl: text("media_url"),
    mediaMimetype: text("media_mimetype"),
    mediaCaption: text("media_caption"),
    mediaFileLength: text("media_file_length"),
    mediaSeconds: integer("media_seconds"),
    mediaIsPtt: boolean("media_is_ptt"),
    contactName: text("contact_name"),
    contactVcard: text("contact_vcard"),
    locationLatitude: decimal("location_latitude", { precision: 10, scale: 7 }),
    locationLongitude: decimal("location_longitude", { precision: 10, scale: 7 }),
    locationName: text("location_name"),
    locationAddress: text("location_address"),
    status: varchar("status", { length: 20 }).default("sent"),
    isAi: boolean("is_ai").default(false),
    isAutomation: boolean("is_automation").default(false),
    quotedMessageId: varchar("quoted_message_id", { length: 255 }),
    quotedMessageText: text("quoted_message_text"),
    isInternal: boolean("is_internal").default(false),
    participant: text("participant"),
    participantName: text("participant_name"),
    errorMessage: text("error_message"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  },
  (table) => ({
    chatTimestampIndex: index("messages_chat_timestamp_idx").on(
      table.chatId,
      table.timestamp,
    ),
  }),
);

export const conversationAiSummaries = pgTable(
  "conversation_ai_summaries",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    messageCount: integer("message_count").notNull().default(0),
    audioMessageCount: integer("audio_message_count").notNull().default(0),
    transcribedAudioCount: integer("transcribed_audio_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    generatedBy: integer("generated_by").references(() => users.id, { onDelete: "set null" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    chatUnique: uniqueIndex("conversation_ai_summaries_chat_uidx").on(table.chatId),
    teamUpdatedIndex: index("conversation_ai_summaries_team_updated_idx").on(table.teamId, table.updatedAt),
  }),
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    id: serial("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    fromMe: boolean("from_me").notNull().default(false),
    remoteJid: text("remote_jid"),
    participantName: text("participant_name"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    messageIdIdx: index("reaction_message_id_idx").on(table.messageId),
    uniqueReaction: unique("unique_reaction_per_user_idx").on(
      table.messageId,
      table.remoteJid,
      table.fromMe,
    ),
  }),
);

export const evolutionInstances = pgTable(
  "evolution_instances",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    instanceName: text("instance_name").notNull(),
    instanceNumber: text("instance_number"),
    evolutionInstanceId: text("evolution_instance_id").unique(),
    metaToken: text("meta_token"),
    accessToken: text("access_token"),
    integration: varchar("integration", { length: 50 })
      .default("WHATSAPP-BAILEYS")
      .notNull(),
    metaBusinessId: text("meta_business_id"),
    metaPhoneNumberId: text("meta_phone_number_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => {
    return {
      teamInstanceNameUnique: unique("team_instance_name_idx").on(
        table.teamId,
        table.instanceName,
      ),
      teamInstanceIdUnique: unique("team_instance_id_idx").on(
        table.teamId,
        table.evolutionInstanceId,
      ),
      teamIdIndex: index("instance_team_id_idx").on(table.teamId),
    };
  },
);

export const funnelStageGroupMembers = pgTable(
  "funnel_stage_group_members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => funnelStageGroups.id, { onDelete: "cascade" }),
    stageId: integer("stage_id")
      .notNull()
      .references(() => funnelStages.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0),
  },
);

export const funnelStageGroups = pgTable("funnel_stage_groups", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 300 }),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const funnelStages = pgTable("funnel_stages", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  groupId: integer("group_id").references(() => funnelStageGroups.id, { onDelete: "set null" }),
  name: varchar("name", { length: 100 }).notNull(),
  emoji: varchar("emoji", { length: 10 }).default("📁"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    color: varchar("color", { length: 20 }).default("gray"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamNameUnique: unique("team_tag_name_idx").on(table.teamId, table.name),
  }),
);

export const departments = pgTable(
  "departments",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamNameUnique: unique("team_department_name_idx").on(
      table.teamId,
      table.name,
    ),
  }),
);

export const messageDraftCategories = pgTable(
  "message_draft_categories",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    color: varchar("color", { length: 20 }).default("gray"),
    order: integer("order").notNull().default(0),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamNameUnique: unique("team_message_draft_category_name_idx").on(
      table.teamId,
      table.name,
    ),
    teamIdIndex: index("message_draft_category_team_id_idx").on(table.teamId),
  }),
);

export const messageDraftTags = pgTable(
  "message_draft_tags",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    color: varchar("color", { length: 20 }).default("gray"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamNameUnique: unique("team_message_draft_tag_name_idx").on(
      table.teamId,
      table.name,
    ),
    teamIdIndex: index("message_draft_tag_team_id_idx").on(table.teamId),
  }),
);

export const messageDrafts = pgTable(
  "message_drafts",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    draftType: varchar("draft_type", { length: 20 }).notNull().default("static"),
    aiMetadata: jsonb("ai_metadata").$type<{
      prompt: string;
      mode: "create" | "rewrite" | "variables";
      generatedAt: string;
    }>(),
    categoryId: integer("category_id").references(() => messageDraftCategories.id, {
      onDelete: "set null",
    }),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    assignedUserId: integer("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    departmentId: integer("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    stages: jsonb("stages").$type<{
      stages: Array<{
        id: string;
        name: string;
        order: number;
        departmentId?: number | null;
      }>;
      tasks: Array<{
        id: string;
        stageId: string;
        name: string;
        order: number;
        type: "task" | "subtask" | "group";
        parentTaskId?: string | null;
      }>;
    }>(),
    isArchived: boolean("is_archived").notNull().default(false),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    updatedBy: integer("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamIdIndex: index("message_draft_team_id_idx").on(table.teamId),
    categoryIdIndex: index("message_draft_category_id_idx").on(table.categoryId),
    assignedUserIdIndex: index("message_draft_assigned_user_id_idx").on(
      table.assignedUserId,
    ),
    departmentIdIndex: index("message_draft_department_id_idx").on(
      table.departmentId,
    ),
    contactIdIndex: index("message_draft_contact_id_idx").on(table.contactId),
    titleIndex: index("message_draft_title_idx").on(table.title),
  }),
);

export const messageDraftTagLinks = pgTable(
  "message_draft_tag_links",
  {
    draftId: integer("draft_id")
      .notNull()
      .references(() => messageDrafts.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => messageDraftTags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    draftTagUnique: unique("message_draft_tag_link_idx").on(
      table.draftId,
      table.tagId,
    ),
    draftIdIndex: index("message_draft_tag_link_draft_id_idx").on(table.draftId),
    tagIdIndex: index("message_draft_tag_link_tag_id_idx").on(table.tagId),
  }),
);

export const departmentMembers = pgTable(
  "department_members",
  {
    id: serial("id").primaryKey(),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    deptUserUnique: unique("dept_user_idx").on(
      table.departmentId,
      table.userId,
    ),
  }),
);

export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    chatId: integer("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" })
      .unique(),
    name: text("name").notNull(),
    assignedUserId: integer("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedDepartmentId: integer("assigned_department_id").references(
      () => departments.id,
      { onDelete: "set null" },
    ),
    funnelStageId: integer("funnel_stage_id").references(
      () => funnelStages.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    customData: jsonb("custom_data").$type<Record<string, any>>().default({}),
    showTimeInStage: boolean("show_time_in_stage").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamIdIndex: index("contact_team_id_idx").on(table.teamId),
    chatIdIndex: index("contact_chat_id_idx").on(table.chatId),
  }),
);

export const contactTags = pgTable(
  "contact_tags",
  {
    id: serial("id").primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    contactTagUnique: unique("contact_tag_idx").on(
      table.contactId,
      table.tagId,
    ),
  }),
);

export const quickReplies = pgTable(
  "quick_replies",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    shortcut: varchar("shortcut", { length: 50 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamShortcutUnique: unique("team_shortcut_idx").on(
      table.teamId,
      table.shortcut,
    ),
  }),
);

export const wabaTemplates = pgTable(
  "waba_templates",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    instanceId: integer("instance_id")
      .notNull()
      .references(() => evolutionInstances.id, { onDelete: "cascade" }),

    metaId: text("meta_id"),

    name: varchar("name", { length: 255 }).notNull(),
    language: varchar("language", { length: 10 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(),

    status: varchar("status", { length: 50 }).notNull().default("PENDING"),
    components: jsonb("components").notNull(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqueNameLang: unique("waba_template_name_lang_idx").on(
      table.instanceId,
      table.name,
      table.language,
    ),
  }),
);

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  instanceId: integer("instance_id")
    .notNull()
    .references(() => evolutionInstances.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("DRAFT").notNull(),
  scheduledAt: timestamp("scheduled_at"),
  templateId: integer("template_id").references(() => wabaTemplates.id),
  totalLeads: integer("total_leads").default(0),
  sentCount: integer("sent_count").default(0),
  failedCount: integer("failed_count").default(0),
  createContacts: boolean("create_contacts").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const campaignLeads = pgTable("campaign_leads", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  phone: varchar("phone", { length: 50 }).notNull(),
  variables: jsonb("variables"),
  status: varchar("status", { length: 20 }).default("PENDING"),
  error: text("error"),
});

export const automationFolders = pgTable(
  "automation_folders",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references(
      (): any => automationFolders.id,
      { onDelete: "cascade" },
    ),
    name: varchar("name", { length: 120 }).notNull(),
    color: varchar("color", { length: 20 }).notNull().default("#8B9D83"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamParentPositionIdx: index(
      "automation_folders_team_parent_position_idx",
    ).on(table.teamId, table.parentId, table.position),
  }),
);

export const automations = pgTable("automations", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  folderId: integer("folder_id").references(() => automationFolders.id, {
    onDelete: "set null",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  instanceId: integer("instance_id").references(() => evolutionInstances.id, {
    onDelete: "set null",
  }),
  triggerKeyword: varchar("trigger_keyword", { length: 100 }),
  note: text("note"),
  nodes: jsonb("nodes").notNull().default([]),
  edges: jsonb("edges").notNull().default([]),

  isActive: boolean("is_active").default(false).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { precision: 3 }).notNull().defaultNow(),
});

export const automationSessions = pgTable("automation_sessions", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),

  automationId: integer("automation_id")
    .notNull()
    .references(() => automations.id, { onDelete: "cascade" }),
  chatId: integer("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  currentNodeId: text("current_node_id"),
  variables: jsonb("variables").default({}),
  status: varchar("status", { length: 20 }).default("active").notNull(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const automationTemplates = pgTable(
  "automation_templates",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").references(() => teams.id, {
      onDelete: "cascade",
    }),
    instanceId: integer("instance_id").references(() => evolutionInstances.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    isPublic: boolean("is_public").notNull().default(false),
    nodes: jsonb("nodes").notNull().default([]),
    edges: jsonb("edges").notNull().default([]),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamPublicIdx: index("automation_templates_team_public_idx").on(
      table.teamId,
      table.isPublic,
    ),
    instanceIdIdx: index("automation_templates_instance_id_idx").on(
      table.instanceId,
    ),
    createdByIdx: index("automation_templates_created_by_idx").on(
      table.createdBy,
    ),
  }),
);

export const aiConfigs = pgTable(
  "ai_configs",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").default(false).notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    apiKey: text("api_key").notNull(),
    systemPrompt: text("system_prompt"),
    attachments: jsonb("attachments")
      .$type<{ name: string; url: string; type: string; size: number }[]>()
      .default([]),
    temperature: decimal("temperature", { precision: 2, scale: 1 }).default(
      "0.7",
    ),
    maxOutputTokens: integer("max_output_tokens").default(1000),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    uniqueTeamConfig: unique("team_ai_config_idx").on(t.teamId),
  }),
);

export const aiSessions = pgTable("ai_sessions", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).default("active"),
  history: jsonb("history").default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiTools = pgTable(
  "ai_tools",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).notNull(),
    description: text("description").notNull(),
    type: varchar("type", { length: 30 }).notNull().default("media"),
    mediaUrl: text("media_url"),
    mediaType: varchar("media_type", { length: 20 }),
    caption: text("caption"),
    confirmationMessage: text("confirmation_message"),
    actionData: jsonb("action_data"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    uniqueToolName: unique("team_tool_name_idx").on(t.teamId, t.name),
  }),
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    key: varchar("key", { length: 255 }).notNull().unique(),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamIdIndex: index("api_key_team_id_idx").on(table.teamId),
    keyIndex: index("api_key_value_idx").on(table.key),
  }),
);

/**
 * Tokens exclusivos para la API externa de consulta. El secreto completo se
 * entrega una sola vez y nunca se persiste: solo guardamos SHA-256, prefijo y
 * últimos caracteres para identificarlo y revocarlo desde la interfaz.
 */
export const readOnlyApiTokens = pgTable(
  "read_only_api_tokens",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    tokenPrefix: varchar("token_prefix", { length: 16 }).notNull(),
    tokenLastFour: varchar("token_last_four", { length: 4 }).notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default(["read:*"]),
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamCreatedIdx: index("read_only_api_tokens_team_created_idx").on(table.teamId, table.createdAt),
    activeIdx: index("read_only_api_tokens_active_idx").on(table.teamId, table.revokedAt, table.expiresAt),
  }),
);

/**
 * OAuth 2.1 clients dynamically registered by remote MCP consumers. Each
 * registration is tenant/user-bound because this connector is provisioned as
 * a user-scoped plugin instead of a platform-wide integration.
 */
export const grokConnectorOAuthClients = pgTable(
  "grok_connector_oauth_clients",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 160 }).notNull().unique(),
    clientName: varchar("client_name", { length: 160 }).notNull().default("Grok"),
    redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
    grantTypes: jsonb("grant_types").$type<string[]>().notNull().default(["authorization_code", "refresh_token"]),
    responseTypes: jsonb("response_types").$type<string[]>().notNull().default(["code"]),
    tokenEndpointAuthMethod: varchar("token_endpoint_auth_method", { length: 40 }).notNull().default("none"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamUserIdx: index("grok_connector_oauth_clients_team_user_idx").on(table.teamId, table.userId),
  }),
);

/**
 * One-way hashes for link codes, authorization codes, access tokens and
 * refresh tokens. Plain credentials are returned only at issuance time.
 */
export const grokConnectorCredentials = pgTable(
  "grok_connector_credentials",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 160 }),
    kind: varchar("kind", { length: 32 }).notNull(),
    secretHash: varchar("secret_hash", { length: 64 }).notNull().unique(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default(["whatspro:read"]),
    redirectUri: text("redirect_uri"),
    codeChallenge: varchar("code_challenge", { length: 160 }),
    resource: text("resource"),
    familyId: varchar("family_id", { length: 80 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    revokedAt: timestamp("revoked_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    activeSecretIdx: index("grok_connector_credentials_active_secret_idx").on(table.secretHash, table.kind, table.revokedAt, table.expiresAt),
    teamUserClientIdx: index("grok_connector_credentials_team_user_client_idx").on(table.teamId, table.userId, table.clientId),
    familyIdx: index("grok_connector_credentials_family_idx").on(table.familyId),
  }),
);

export const customFields = pgTable(
  "custom_fields",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    key: varchar("key", { length: 100 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("text"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamKeyUnique: unique("team_field_key_idx").on(table.teamId, table.key),
  }),
);

export const customFieldsRelations = relations(customFields, ({ one }) => ({
  team: one(teams, {
    fields: [customFields.teamId],
    references: [teams.id],
  }),
}));

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    instanceName: varchar("instance_name", { length: 255 }).notNull(),
    event: varchar("event", { length: 100 }).notNull(),
    messageId: text("message_id"),
    remoteJid: text("remote_jid"),
    status: varchar("status", { length: 20 }).notNull().default("received"),
    error: text("error"),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamIdIdx: index("webhook_events_team_id_idx").on(table.teamId),
    statusIdx: index("webhook_events_status_idx").on(table.status),
    createdAtIdx: index("webhook_events_created_at_idx").on(table.createdAt),
  }),
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  team: one(teams, {
    fields: [apiKeys.teamId],
    references: [teams.id],
  }),
}));

export const readOnlyApiTokensRelations = relations(readOnlyApiTokens, ({ one }) => ({
  team: one(teams, {
    fields: [readOnlyApiTokens.teamId],
    references: [teams.id],
  }),
  creator: one(users, {
    fields: [readOnlyApiTokens.createdBy],
    references: [users.id],
  }),
}));

export const grokConnectorOAuthClientsRelations = relations(grokConnectorOAuthClients, ({ one }) => ({
  team: one(teams, { fields: [grokConnectorOAuthClients.teamId], references: [teams.id] }),
  user: one(users, { fields: [grokConnectorOAuthClients.userId], references: [users.id] }),
}));

export const grokConnectorCredentialsRelations = relations(grokConnectorCredentials, ({ one }) => ({
  team: one(teams, { fields: [grokConnectorCredentials.teamId], references: [teams.id] }),
  user: one(users, { fields: [grokConnectorCredentials.userId], references: [users.id] }),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  teams: many(teams),
}));

export const aiToolsRelations = relations(aiTools, ({ one }) => ({
  team: one(teams, {
    fields: [aiTools.teamId],
    references: [teams.id],
  }),
}));

export const automationsRelations = relations(automations, ({ one, many }) => ({
  team: one(teams, {
    fields: [automations.teamId],
    references: [teams.id],
  }),
  instance: one(evolutionInstances, {
    fields: [automations.instanceId],
    references: [evolutionInstances.id],
  }),
  folder: one(automationFolders, {
    fields: [automations.folderId],
    references: [automationFolders.id],
  }),
  sessions: many(automationSessions),
}));

export const automationFoldersRelations = relations(
  automationFolders,
  ({ one, many }) => ({
    team: one(teams, {
      fields: [automationFolders.teamId],
      references: [teams.id],
    }),
    parent: one(automationFolders, {
      fields: [automationFolders.parentId],
      references: [automationFolders.id],
      relationName: "automationFolderHierarchy",
    }),
    children: many(automationFolders, {
      relationName: "automationFolderHierarchy",
    }),
    automations: many(automations),
  }),
);

export const automationSessionsRelations = relations(
  automationSessions,
  ({ one }) => ({
    automation: one(automations, {
      fields: [automationSessions.automationId],
      references: [automations.id],
    }),
    chat: one(chats, {
      fields: [automationSessions.chatId],
      references: [chats.id],
    }),
    contact: one(contacts, {
      fields: [automationSessions.contactId],
      references: [contacts.id],
    }),
  }),
);

export const automationTemplatesRelations = relations(
  automationTemplates,
  ({ one }) => ({
    team: one(teams, {
      fields: [automationTemplates.teamId],
      references: [teams.id],
    }),
    instance: one(evolutionInstances, {
      fields: [automationTemplates.instanceId],
      references: [evolutionInstances.id],
    }),
    author: one(users, {
      fields: [automationTemplates.createdBy],
      references: [users.id],
    }),
  }),
);

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  team: one(teams, { fields: [campaigns.teamId], references: [teams.id] }),
  instance: one(evolutionInstances, {
    fields: [campaigns.instanceId],
    references: [evolutionInstances.id],
  }),
  template: one(wabaTemplates, {
    fields: [campaigns.templateId],
    references: [wabaTemplates.id],
  }),
  leads: many(campaignLeads),
}));

export const campaignLeadsRelations = relations(campaignLeads, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignLeads.campaignId],
    references: [campaigns.id],
  }),
}));

export const wabaTemplatesRelations = relations(wabaTemplates, ({ one }) => ({
  team: one(teams, {
    fields: [wabaTemplates.teamId],
    references: [teams.id],
  }),
  instance: one(evolutionInstances, {
    fields: [wabaTemplates.instanceId],
    references: [evolutionInstances.id],
  }),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  team: one(teams, {
    fields: [departments.teamId],
    references: [teams.id],
  }),
  members: many(departmentMembers),
  contacts: many(contacts),
  messageDrafts: many(messageDrafts),
}));

export const messageDraftCategoriesRelations = relations(
  messageDraftCategories,
  ({ one, many }) => ({
    team: one(teams, {
      fields: [messageDraftCategories.teamId],
      references: [teams.id],
    }),
    drafts: many(messageDrafts),
  }),
);

export const messageDraftTagsRelations = relations(
  messageDraftTags,
  ({ one, many }) => ({
    team: one(teams, {
      fields: [messageDraftTags.teamId],
      references: [teams.id],
    }),
    draftLinks: many(messageDraftTagLinks),
  }),
);

export const messageDraftsRelations = relations(
  messageDrafts,
  ({ one, many }) => ({
    team: one(teams, {
      fields: [messageDrafts.teamId],
      references: [teams.id],
    }),
    category: one(messageDraftCategories, {
      fields: [messageDrafts.categoryId],
      references: [messageDraftCategories.id],
    }),
    contact: one(contacts, {
      fields: [messageDrafts.contactId],
      references: [contacts.id],
    }),
    assignedUser: one(users, {
      fields: [messageDrafts.assignedUserId],
      references: [users.id],
    }),
    department: one(departments, {
      fields: [messageDrafts.departmentId],
      references: [departments.id],
    }),
    createdByUser: one(users, {
      fields: [messageDrafts.createdBy],
      references: [users.id],
      relationName: "message_draft_created_by_user",
    }),
    updatedByUser: one(users, {
      fields: [messageDrafts.updatedBy],
      references: [users.id],
      relationName: "message_draft_updated_by_user",
    }),
    tagLinks: many(messageDraftTagLinks),
  }),
);

export const messageDraftTagLinksRelations = relations(
  messageDraftTagLinks,
  ({ one }) => ({
    draft: one(messageDrafts, {
      fields: [messageDraftTagLinks.draftId],
      references: [messageDrafts.id],
    }),
    tag: one(messageDraftTags, {
      fields: [messageDraftTagLinks.tagId],
      references: [messageDraftTags.id],
    }),
  }),
);

export const departmentMembersRelations = relations(
  departmentMembers,
  ({ one }) => ({
    department: one(departments, {
      fields: [departmentMembers.departmentId],
      references: [departments.id],
    }),
    user: one(users, {
      fields: [departmentMembers.userId],
      references: [users.id],
    }),
  }),
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
  plan: one(plans, {
    fields: [teams.planId],
    references: [plans.id],
  }),
  reseller: one(resellers, {
    fields: [teams.resellerId],
    references: [resellers.id],
  }),
  teamMembers: many(teamMembers),
  activityLogs: many(activityLogs),
  invitations: many(invitations),
  chats: many(chats),
  evolutionInstances: many(evolutionInstances),
  contacts: many(contacts),
  tags: many(tags),
  messageDraftCategories: many(messageDraftCategories),
  messageDraftTags: many(messageDraftTags),
  messageDrafts: many(messageDrafts),
  funnelStages: many(funnelStages),
  funnelStageGroups: many(funnelStageGroups),
  quickReplies: many(quickReplies),
  wabaTemplates: many(wabaTemplates),
  automations: many(automations),
  automationFolders: many(automationFolders),
  apiKeys: many(apiKeys),
  readOnlyApiTokens: many(readOnlyApiTokens),
  customFields: many(customFields),
  departments: many(departments),
}));

export const usersRelations = relations(users, ({ many }) => ({
  teamMembers: many(teamMembers),
  invitationsSent: many(invitations),
  contactsAssigned: many(contacts),
  departmentMembers: many(departmentMembers),
  messageDraftsAssigned: many(messageDrafts),
  messageDraftsCreated: many(messageDrafts, {
    relationName: "message_draft_created_by_user",
  }),
  messageDraftsUpdated: many(messageDrafts, {
    relationName: "message_draft_updated_by_user",
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  team: one(teams, {
    fields: [invitations.teamId],
    references: [teams.id],
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  team: one(teams, {
    fields: [activityLogs.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const chatsRelations = relations(chats, ({ one, many }) => ({
  team: one(teams, {
    fields: [chats.teamId],
    references: [teams.id],
  }),
  messages: many(messages),
  contact: one(contacts, {
    fields: [chats.id],
    references: [contacts.chatId],
  }),
  instance: one(evolutionInstances, {
    fields: [chats.instanceId],
    references: [evolutionInstances.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
  reactions: many(messageReactions),
}));

export const messageReactionsRelations = relations(
  messageReactions,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageReactions.messageId],
      references: [messages.id],
    }),
    chat: one(chats, {
      fields: [messageReactions.chatId],
      references: [chats.id],
    }),
  }),
);

export const evolutionInstancesRelations = relations(
  evolutionInstances,
  ({ one, many }) => ({
    team: one(teams, {
      fields: [evolutionInstances.teamId],
      references: [teams.id],
    }),
    chats: many(chats),
    wabaTemplates: many(wabaTemplates),
  }),
);

export const funnelStageGroupMembersRelations = relations(
  funnelStageGroupMembers,
  ({ one }) => ({
    group: one(funnelStageGroups, {
      fields: [funnelStageGroupMembers.groupId],
      references: [funnelStageGroups.id],
    }),
    stage: one(funnelStages, {
      fields: [funnelStageGroupMembers.stageId],
      references: [funnelStages.id],
    }),
  }),
);

export const funnelStageGroupsRelations = relations(
  funnelStageGroups,
  ({ one, many }) => ({
    team: one(teams, {
      fields: [funnelStageGroups.teamId],
      references: [teams.id],
    }),
    members: many(funnelStageGroupMembers),
  }),
);

export const funnelStagesRelations = relations(
  funnelStages,
  ({ one, many }) => ({
    team: one(teams, {
      fields: [funnelStages.teamId],
      references: [teams.id],
    }),
    group: one(funnelStageGroups, {
      fields: [funnelStages.groupId],
      references: [funnelStageGroups.id],
    }),
    groupMembers: many(funnelStageGroupMembers),
    contacts: many(contacts),
  }),
);

export const tagsRelations = relations(tags, ({ one, many }) => ({
  team: one(teams, {
    fields: [tags.teamId],
    references: [teams.id],
  }),
  contactTags: many(contactTags),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  team: one(teams, {
    fields: [contacts.teamId],
    references: [teams.id],
  }),
  chat: one(chats, {
    fields: [contacts.chatId],
    references: [chats.id],
  }),
  assignedUser: one(users, {
    fields: [contacts.assignedUserId],
    references: [users.id],
  }),
  assignedDepartment: one(departments, {
    fields: [contacts.assignedDepartmentId],
    references: [departments.id],
  }),
  funnelStage: one(funnelStages, {
    fields: [contacts.funnelStageId],
    references: [funnelStages.id],
  }),
  contactTags: many(contactTags),
  messageDrafts: many(messageDrafts),
}));

export const contactTagsRelations = relations(contactTags, ({ one }) => ({
  contact: one(contacts, {
    fields: [contactTags.contactId],
    references: [contacts.id],
  }),
  tag: one(tags, {
    fields: [contactTags.tagId],
    references: [tags.id],
  }),
}));

export const quickRepliesRelations = relations(quickReplies, ({ one }) => ({
  team: one(teams, {
    fields: [quickReplies.teamId],
    references: [teams.id],
  }),
}));

export type BrandingTheme = {
  light?: Record<string, string>;
  dark?: Record<string, string>;
  radius?: string;
};

export type BrandingLegal = {
  companyLegalName?: string;
  privacyHtml?: string;
  termsHtml?: string;
};

export type BrandingEmailSettings = {
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  footerHtml?: string;
};

/** Solo ids tipados: nunca scripts arbitrarios. Ver la nota de XSS del módulo de landing. */
export type BrandingAnalytics = {
  gaId?: string;
  metaPixelId?: string;
  gtmId?: string;
};

/** reseller_id NULL = la marca de la plataforma. Una fila por reseller. */
export const branding = pgTable("branding", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id").references(() => resellers.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 100 }).notNull().default("WhatsPro"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  theme: jsonb("theme").$type<BrandingTheme>().notNull().default({}),
  legal: jsonb("legal").$type<BrandingLegal>().notNull().default({}),
  emailSettings: jsonb("email_settings")
    .$type<BrandingEmailSettings>()
    .notNull()
    .default({}),
  analytics: jsonb("analytics").$type<BrandingAnalytics>().notNull().default({}),
  supportEmail: varchar("support_email", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const landingContent = pgTable("landing_content", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id").references(() => resellers.id, {
    onDelete: "cascade",
  }),
  homeSections: jsonb("home_sections")
    .$type<import("@/lib/landing/types").LandingHomeSection[]>()
    .notNull()
    .default([]),
  faqItems: jsonb("faq_items")
    .$type<import("@/lib/landing/types").LandingFaqItem[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const landingPages = pgTable("landing_pages", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id").references(() => resellers.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 120 }).notNull(),
  // El slug es único por tenant (índices parciales en 0050), no globalmente.
  slug: varchar("slug", { length: 140 }).notNull(),
  contentMode: varchar("content_mode", { length: 20 })
    .$type<import("@/lib/landing/types").LandingPageContentMode>()
    .notNull()
    .default("builder"),
  /** En modo "html" guarda el HTML crudo; se sanea en el render, nunca al guardar. */
  content: text("content").notNull().default(""),
  customCss: text("custom_css").notNull().default(""),
  hideChrome: boolean("hide_chrome").notNull().default(false),
  externalPrompt: text("external_prompt").notNull().default(""),
  sections: jsonb("sections")
    .$type<import("@/lib/landing/types").LandingPageSection[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const docsArticleAudienceEnum = pgEnum("docs_article_audience", [
  "technical",
  "non_technical",
  "mixed",
]);

export const docsCategories = pgTable("docs_categories", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 80 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const docsTags = pgTable("docs_tags", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const docsArticles = pgTable(
  "docs_articles",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    title: varchar("title", { length: 255 }).notNull(),
    excerpt: text("excerpt"),
    contentMd: text("content_md"),
    contentJson: jsonb("content_json"),
    categoryId: integer("category_id").references(() => docsCategories.id, {
      onDelete: "set null",
    }),
    audience: docsArticleAudienceEnum("audience").notNull().default("mixed"),
    isPublished: boolean("is_published").notNull().default(false),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    docsArticlesSlugIdx: index("docs_articles_slug_idx").on(table.slug),
    docsArticlesCategoryIdx: index("docs_articles_category_idx").on(
      table.categoryId,
    ),
    docsArticlesPublishedIdx: index("docs_articles_published_idx").on(
      table.isPublished,
    ),
  }),
);

export const docsArticleTags = pgTable(
  "docs_article_tags",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => docsArticles.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => docsTags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({
      name: "docs_article_tags_pk",
      columns: [table.articleId, table.tagId],
    }),
    docsArticleTagsArticleIdx: index("docs_article_tags_article_idx").on(
      table.articleId,
    ),
    docsArticleTagsTagIdx: index("docs_article_tags_tag_idx").on(table.tagId),
  }),
);

export const chatTheme = pgTable("chat_theme", {
  id: serial("id").primaryKey(),
  backgroundType: varchar("background_type", { length: 20 })
    .notNull()
    .default("solid"),
  backgroundColor: varchar("background_color", { length: 30 })
    .notNull()
    .default("#F4F4F5"),
  backgroundImageUrl: text("background_image_url"),
  userBubbleColor: varchar("user_bubble_color", { length: 30 })
    .notNull()
    .default("#E2EDE4"),
  contactBubbleColor: varchar("contact_bubble_color", { length: 30 })
    .notNull()
    .default("#FFFFFF"),
  darkBackgroundColor: varchar("dark_background_color", { length: 30 })
    .notNull()
    .default("#27272A"),
  darkUserBubbleColor: varchar("dark_user_bubble_color", { length: 30 })
    .notNull()
    .default("#2A352E"),
  darkContactBubbleColor: varchar("dark_contact_bubble_color", { length: 30 })
    .notNull()
    .default("#18181B"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const automationAdminSettings = pgTable("automation_admin_settings", {
  id: serial("id").primaryKey(),
  aiFlowGeneratorEnabled: boolean("ai_flow_generator_enabled")
    .notNull()
    .default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * reseller_id NULL = credenciales de la plataforma. El UNIQUE global sobre `provider`
 * se sustituyó por dos índices parciales en 0050 para que cada reseller pueda tener
 * su propia fila por proveedor: toda lectura de la plataforma debe filtrar isNull(resellerId).
 */
export const paymentProviderSettings = pgTable("payment_provider_settings", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id").references((): any => resellers.id, {
    onDelete: "cascade",
  }),
  provider: varchar("provider", { length: 50 }).notNull(),
  enabled: boolean("enabled").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  config: jsonb("config")
    .$type<Record<string, string | undefined>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const manualPayments = pgTable("manual_payments", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id").references((): any => resellers.id, {
    onDelete: "cascade",
  }),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("usd"),
  status: varchar("status", { length: 30 })
    .notNull()
    .default("pending_manual_review"),
  reference: text("reference"),
  proofUrl: text("proof_url"),
  reviewedBy: integer("reviewed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: serial("id").primaryKey(),
    provider: varchar("provider", { length: 50 }).notNull(),
    topic: varchar("topic", { length: 80 }).notNull(),
    eventId: varchar("event_id", { length: 191 }),
    paymentId: varchar("payment_id", { length: 191 }),
    status: varchar("status", { length: 20 }).notNull().default("processing"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    /** Dos resellers pueden recibir el mismo event_id desde sus respectivas cuentas. */
    resellerId: integer("reseller_id").references((): any => resellers.id, {
      onDelete: "cascade",
    }),
  },
  (table) => ({
    // La unicidad pasó a índices parciales sobre (provider, COALESCE(reseller_id,0), ...)
    // en la migración 0050; drizzle no puede expresar el COALESCE, así que vive solo en SQL.
    providerStatusIdx: index("payment_webhook_events_provider_status_idx").on(
      table.provider,
      table.status,
    ),
  }),
);

export const paymentAuditEvents = pgTable(
  "payment_audit_events",
  {
    id: serial("id").primaryKey(),
    resellerId: integer("reseller_id").references((): any => resellers.id, {
      onDelete: "set null",
    }),
    teamId: integer("team_id").references(() => teams.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 50 }).notNull(),
    paymentReference: varchar("payment_reference", { length: 191 }).notNull(),
    previousStatus: varchar("previous_status", { length: 30 }),
    nextStatus: varchar("next_status", { length: 30 }).notNull(),
    actor: varchar("actor", { length: 30 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    resellerCreatedIdx: index("payment_audit_events_reseller_created_idx").on(
      table.resellerId,
      table.createdAt,
    ),
    teamCreatedIdx: index("payment_audit_events_team_created_idx").on(
      table.teamId,
      table.createdAt,
    ),
  }),
);

export const marketplaceItems = pgTable(
  "marketplace_items",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 180 }).notNull(),
    subtitle: varchar("subtitle", { length: 255 }),
    iconUrl: text("icon_url"),
    imageUrl: text("image_url"),
    description: text("description"),
    category: varchar("category", { length: 80 }).notNull().default("general"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    interfaceBlocks: jsonb("interface_blocks")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    customFields: jsonb("custom_fields")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    isDefault: boolean("is_default").notNull().default(false),
    isFunctional: boolean("is_functional").notNull().default(false),
    appType: varchar("app_type", { length: 30 }).notNull().default("installable"),
    features: jsonb("features").$type<Array<{ id: string; name: string; description: string; enabled?: boolean }>>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    categoryStatusIdx: index("marketplace_items_category_status_idx").on(
      table.category,
      table.status,
    ),
  }),
);

export const marketplaceItemPrices = pgTable(
  "marketplace_item_prices",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => marketplaceItems.id, { onDelete: "cascade" }),
    billingType: varchar("billing_type", { length: 20 }).notNull(),
    amount: integer("amount").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("usd"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    itemEnabledIdx: index("marketplace_item_prices_item_enabled_idx").on(
      table.itemId,
      table.enabled,
    ),
  }),
);

export const marketplaceOrders = pgTable(
  "marketplace_orders",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => marketplaceItems.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 40 }).notNull().default("pending_review"),
    total: integer("total").notNull().default(0),
    requestedBy: integer("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewedBy: integer("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamStatusIdx: index("marketplace_orders_team_status_idx").on(
      table.teamId,
      table.status,
    ),
    statusCreatedIdx: index("marketplace_orders_status_created_at_idx").on(
      table.status,
      table.createdAt,
    ),
  }),
);

export const marketplaceOrderLines = pgTable(
  "marketplace_order_lines",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => marketplaceOrders.id, { onDelete: "cascade" }),
    priceId: integer("price_id")
      .notNull()
      .references(() => marketplaceItemPrices.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    unitAmount: integer("unit_amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("usd"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orderIdIdx: index("marketplace_order_lines_order_id_idx").on(table.orderId),
  }),
);

export const marketplaceOrderStatusEvents = pgTable(
  "marketplace_order_status_events",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => marketplaceOrders.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    previousStatus: varchar("previous_status", { length: 40 }),
    nextStatus: varchar("next_status", { length: 40 }).notNull(),
    changedBy: integer("changed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    orderCreatedIdx: index("marketplace_order_status_events_order_created_idx").on(
      table.orderId,
      table.createdAt,
    ),
    teamCreatedIdx: index("marketplace_order_status_events_team_created_idx").on(
      table.teamId,
      table.createdAt,
    ),
  }),
);

export const teamMarketplaceEntitlements = pgTable(
  "team_marketplace_entitlements",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => marketplaceItems.id, { onDelete: "restrict" }),
    status: varchar("status", { length: 40 }).notNull().default("inactive"),
    sourceOrderId: integer("source_order_id").references(() => marketplaceOrders.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at").notNull().defaultNow(),
    endsAt: timestamp("ends_at"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamItemUnique: unique("team_marketplace_entitlements_team_item_uidx").on(
      table.teamId,
      table.itemId,
    ),
    teamStatusIdx: index("team_marketplace_entitlements_team_status_idx").on(
      table.teamId,
      table.status,
    ),
    itemStatusIdx: index("team_marketplace_entitlements_item_status_idx").on(
      table.itemId,
      table.status,
    ),
  }),
);

export const featureRequests = pgTable(
  "feature_requests",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    requestedBy: integer("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    appId: integer("app_id").references(() => marketplaceItems.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    category: varchar("category", { length: 80 }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("pending"),
    votes: integer("votes").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamStatusIdx: index("feature_requests_team_status_idx").on(
      table.teamId,
      table.status,
    ),
    appIdIdx: index("feature_requests_app_id_idx").on(table.appId),
    requestedByIdx: index("feature_requests_requested_by_idx").on(
      table.requestedBy,
    ),
    categoryIdx: index("feature_requests_category_idx").on(table.category),
  }),
);

export const featureRequestVotes = pgTable(
  "feature_request_votes",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => featureRequests.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    requestUserUnique: unique("feature_request_votes_request_user_uidx").on(
      table.requestId,
      table.userId,
    ),
    requestIdIdx: index("feature_request_votes_request_id_idx").on(
      table.requestId,
    ),
    userIdIdx: index("feature_request_votes_user_id_idx").on(table.userId),
  }),
);

export const teamPlugins = pgTable(
  "team_plugins",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    pluginId: varchar("plugin_id", { length: 80 }).notNull(),
    installed: boolean("installed").notNull().default(false),
    enabled: boolean("enabled").notNull().default(false),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    installedBy: integer("installed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    installedAt: timestamp("installed_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamPluginUnique: unique("team_plugins_team_id_plugin_id_idx").on(
      table.teamId,
      table.pluginId,
    ),
    teamEnabledIdx: index("team_plugins_team_enabled_idx").on(
      table.teamId,
      table.enabled,
    ),
  }),
);

export const pluginSystemStates = pgTable(
  "plugin_system_states",
  {
    id: serial("id").primaryKey(),
    pluginId: varchar("plugin_id", { length: 80 }).notNull().unique(),
    enabledByDefault: boolean("enabled_by_default").notNull().default(false),
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    pluginEnabledIdx: index("plugin_system_states_enabled_idx").on(table.enabledByDefault),
  }),
);

export const teamMemberPlugins = pgTable(
  "team_member_plugins",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pluginId: varchar("plugin_id", { length: 80 }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamUserPluginUnique: unique("team_member_plugins_team_user_plugin_idx").on(
      table.teamId,
      table.userId,
      table.pluginId,
    ),
    teamUserIdx: index("team_member_plugins_team_user_idx").on(table.teamId, table.userId),
    teamPluginIdx: index("team_member_plugins_team_plugin_idx").on(table.teamId, table.pluginId),
  }),
);

export const teamMenuItems = pgTable(
  "team_menu_items",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    itemKey: varchar("item_key", { length: 160 }).notNull(),
    pinned: boolean("pinned").notNull().default(true),
    order: integer("order").notNull().default(0),
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamItemUnique: unique("team_menu_items_team_item_idx").on(
      table.teamId,
      table.itemKey,
    ),
    teamOrderIdx: index("team_menu_items_team_order_idx").on(table.teamId, table.order),
  }),
);

export const teamSites = pgTable(
  "team_sites",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    category: varchar("category", { length: 80 }),
    slug: varchar("slug", { length: 63 }).notNull(),
    subdomain: varchar("subdomain", { length: 63 }),
    customDomain: varchar("custom_domain", { length: 253 }),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    published: boolean("published").notNull().default(true),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamIdx: index("team_sites_team_idx").on(table.teamId),
    slugUnique: uniqueIndex("team_sites_slug_uidx").on(table.slug),
    subdomainUnique: uniqueIndex("team_sites_subdomain_uidx")
      .on(table.subdomain)
      .where(sql`${table.subdomain} is not null`),
    customDomainUnique: uniqueIndex("team_sites_custom_domain_uidx")
      .on(table.customDomain)
      .where(sql`${table.customDomain} is not null`),
  }),
);

export const teamSiteFiles = pgTable(
  "team_site_files",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    siteId: integer("site_id")
      .notNull()
      .references(() => teamSites.id, { onDelete: "cascade" }),
    path: varchar("path", { length: 800 }).notNull(),
    kind: varchar("kind", { length: 12 }).notNull().default("file"),
    mimeType: varchar("mime_type", { length: 160 }),
    encoding: varchar("encoding", { length: 12 }).notNull().default("utf8"),
    content: text("content"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamSiteIdx: index("team_site_files_team_site_idx").on(table.teamId, table.siteId),
    sitePathUnique: unique("team_site_files_site_path_uidx").on(table.siteId, table.path),
  }),
);

export type NoteCommitment = { text: string; assigneeUserId?: number; dueDate?: string; taskItemId?: number };

export const teamNotes = pgTable(
  "team_notes",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    content: text("content").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    pinned: boolean("pinned").notNull().default(false),
    status: varchar("status", { length: 30 }).notNull().default("todo"),
    dueDate: timestamp("due_date"),
    // Vínculo opcional a la reunión/llamada (team_events) que originó la nota —
    // convierte una nota genérica en una Meeting Note sin duplicar el modelo.
    eventId: integer("event_id").references((): AnyPgColumn => teamEvents.id, {
      onDelete: "set null",
    }),
    commitments: jsonb("commitments")
      .$type<NoteCommitment[]>()
      .notNull()
      .default([]),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamStatusIdx: index("team_notes_team_status_idx").on(table.teamId, table.status),
    teamDueIdx: index("team_notes_team_due_idx").on(table.teamId, table.dueDate),
    eventIdx: index("team_notes_event_idx").on(table.eventId),
  }),
);

export const teamEvents = pgTable(
  "team_events",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    attendees: jsonb("attendees").$type<string[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    reminderAt: timestamp("reminder_at", { withTimezone: true }),
    status: varchar("status", { length: 30 }).notNull().default("scheduled"),
    // "meeting" | "call" — el detalle del tipo de reunión/llamada vive en `subtype`
    // (presencial/videollamada/interna/comercial/onboarding/soporte/seguimiento para meeting;
    // entrante/saliente/no_respondio/reagendada para call) para no forzar un enum rígido en DB.
    kind: varchar("kind", { length: 20 }).$type<"meeting" | "call">().notNull().default("meeting"),
    subtype: varchar("subtype", { length: 40 }),
    outcome: text("outcome").notNull().default(""),
    nextAction: text("next_action").notNull().default(""),
    departmentId: integer("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    relatedUserId: integer("related_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    customerId: integer("customer_id").references(() => teamCustomers.id, {
      onDelete: "set null",
    }),
    relatedEventId: integer("related_event_id").references((): AnyPgColumn => teamEvents.id, {
      onDelete: "set null",
    }),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamStartIdx: index("team_events_team_start_idx").on(table.teamId, table.startsAt),
    teamStatusIdx: index("team_events_team_status_idx").on(table.teamId, table.status),
    teamKindIdx: index("team_events_team_kind_idx").on(table.teamId, table.kind),
    customerIdx: index("team_events_customer_idx").on(table.customerId),
  }),
);

export const teamEventParticipants = pgTable(
  "team_event_participants",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    eventId: integer("event_id").notNull().references(() => teamEvents.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 30 }).notNull().default("attendee"),
    responseStatus: varchar("response_status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    eventIdx: index("team_event_participants_event_idx").on(table.eventId),
    userUnique: unique("team_event_participants_event_user_uidx").on(table.eventId, table.userId),
    contactUnique: unique("team_event_participants_event_contact_uidx").on(table.eventId, table.contactId),
  }),
);

export const teamNotifications = pgTable(
  "team_notifications",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    entityType: varchar("entity_type", { length: 50 }),
    entityId: integer("entity_id"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamUnreadIdx: index("team_notifications_team_unread_idx").on(table.teamId, table.readAt),
  }),
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
);

export const marketplaceItemsRelations = relations(
  marketplaceItems,
  ({ many }) => ({
    prices: many(marketplaceItemPrices),
    orders: many(marketplaceOrders),
  }),
);

export const marketplaceItemPricesRelations = relations(
  marketplaceItemPrices,
  ({ one, many }) => ({
    item: one(marketplaceItems, {
      fields: [marketplaceItemPrices.itemId],
      references: [marketplaceItems.id],
    }),
    orderLines: many(marketplaceOrderLines),
  }),
);

export const marketplaceOrdersRelations = relations(
  marketplaceOrders,
  ({ one, many }) => ({
    team: one(teams, {
      fields: [marketplaceOrders.teamId],
      references: [teams.id],
    }),
    item: one(marketplaceItems, {
      fields: [marketplaceOrders.itemId],
      references: [marketplaceItems.id],
    }),
    requestedByUser: one(users, {
      fields: [marketplaceOrders.requestedBy],
      references: [users.id],
      relationName: "marketplace_order_requested_by_user",
    }),
    reviewedByUser: one(users, {
      fields: [marketplaceOrders.reviewedBy],
      references: [users.id],
      relationName: "marketplace_order_reviewed_by_user",
    }),
    lines: many(marketplaceOrderLines),
    statusEvents: many(marketplaceOrderStatusEvents),
  }),
);

export const marketplaceOrderLinesRelations = relations(
  marketplaceOrderLines,
  ({ one }) => ({
    order: one(marketplaceOrders, {
      fields: [marketplaceOrderLines.orderId],
      references: [marketplaceOrders.id],
    }),
    price: one(marketplaceItemPrices, {
      fields: [marketplaceOrderLines.priceId],
      references: [marketplaceItemPrices.id],
    }),
  }),
);

export const marketplaceOrderStatusEventsRelations = relations(
  marketplaceOrderStatusEvents,
  ({ one }) => ({
    order: one(marketplaceOrders, {
      fields: [marketplaceOrderStatusEvents.orderId],
      references: [marketplaceOrders.id],
    }),
    team: one(teams, {
      fields: [marketplaceOrderStatusEvents.teamId],
      references: [teams.id],
    }),
    changedByUser: one(users, {
      fields: [marketplaceOrderStatusEvents.changedBy],
      references: [users.id],
    }),
  }),
);

export const teamMarketplaceEntitlementsRelations = relations(
  teamMarketplaceEntitlements,
  ({ one }) => ({
    team: one(teams, {
      fields: [teamMarketplaceEntitlements.teamId],
      references: [teams.id],
    }),
    item: one(marketplaceItems, {
      fields: [teamMarketplaceEntitlements.itemId],
      references: [marketplaceItems.id],
    }),
    sourceOrder: one(marketplaceOrders, {
      fields: [teamMarketplaceEntitlements.sourceOrderId],
      references: [marketplaceOrders.id],
    }),
  }),
);

export const featureRequestsRelations = relations(
  featureRequests,
  ({ one, many }) => ({
    team: one(teams, {
      fields: [featureRequests.teamId],
      references: [teams.id],
    }),
    requestedByUser: one(users, {
      fields: [featureRequests.requestedBy],
      references: [users.id],
    }),
    app: one(marketplaceItems, {
      fields: [featureRequests.appId],
      references: [marketplaceItems.id],
    }),
    votes: many(featureRequestVotes),
  }),
);

export const featureRequestVotesRelations = relations(
  featureRequestVotes,
  ({ one }) => ({
    request: one(featureRequests, {
      fields: [featureRequestVotes.requestId],
      references: [featureRequests.id],
    }),
    user: one(users, {
      fields: [featureRequestVotes.userId],
      references: [users.id],
    }),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type TeamDataWithMembers = Team & {
  teamMembers: (TeamMember & {
    user: Pick<User, "id" | "name" | "email">;
  })[];
};

export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type EvolutionInstance = typeof evolutionInstances.$inferSelect;
export type NewEvolutionInstance = typeof evolutionInstances.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type FunnelStageGroup = typeof funnelStageGroups.$inferSelect;
export type NewFunnelStageGroup = typeof funnelStageGroups.$inferInsert;
export type FunnelStage = typeof funnelStages.$inferSelect;
export type NewFunnelStage = typeof funnelStages.$inferInsert;

export type QuickReply = typeof quickReplies.$inferSelect;
export type NewQuickReply = typeof quickReplies.$inferInsert;

export type WabaTemplate = typeof wabaTemplates.$inferSelect;
export type NewWabaTemplate = typeof wabaTemplates.$inferInsert;

export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;
export type AutomationSession = typeof automationSessions.$inferSelect;
export type AutomationTemplate = typeof automationTemplates.$inferSelect;
export type NewAutomationTemplate = typeof automationTemplates.$inferInsert;

export type AiTool = typeof aiTools.$inferSelect;
export type NewAiTool = typeof aiTools.$inferInsert;
export type Branding = typeof branding.$inferSelect;
export type NewBranding = typeof branding.$inferInsert;

export type Reseller = typeof resellers.$inferSelect;
export type NewReseller = typeof resellers.$inferInsert;
export type ResellerDomain = typeof resellerDomains.$inferSelect;
export type NewResellerDomain = typeof resellerDomains.$inferInsert;
export type ResellerPlanPrice = typeof resellerPlanPrices.$inferSelect;
export type NewResellerPlanPrice = typeof resellerPlanPrices.$inferInsert;
export type ResellerWallet = typeof resellerWallets.$inferSelect;
export type NewResellerWallet = typeof resellerWallets.$inferInsert;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type NewWalletTransaction = typeof walletTransactions.$inferInsert;
export type ResellerTopup = typeof resellerTopups.$inferSelect;
export type NewResellerTopup = typeof resellerTopups.$inferInsert;
export type LandingContent = typeof landingContent.$inferSelect;
export type NewLandingContent = typeof landingContent.$inferInsert;
export type LandingPage = typeof landingPages.$inferSelect;
export type NewLandingPage = typeof landingPages.$inferInsert;
export type DocsCategory = typeof docsCategories.$inferSelect;
export type NewDocsCategory = typeof docsCategories.$inferInsert;
export type DocsTag = typeof docsTags.$inferSelect;
export type NewDocsTag = typeof docsTags.$inferInsert;
export type DocsArticle = typeof docsArticles.$inferSelect;
export type NewDocsArticle = typeof docsArticles.$inferInsert;
export type DocsArticleTag = typeof docsArticleTags.$inferSelect;
export type NewDocsArticleTag = typeof docsArticleTags.$inferInsert;

export type ChatTheme = typeof chatTheme.$inferSelect;
export type NewChatTheme = typeof chatTheme.$inferInsert;

export type PaymentProviderSetting =
  typeof paymentProviderSettings.$inferSelect;
export type NewPaymentProviderSetting =
  typeof paymentProviderSettings.$inferInsert;

export type ManualPayment = typeof manualPayments.$inferSelect;
export type NewManualPayment = typeof manualPayments.$inferInsert;

export type MarketplaceItem = typeof marketplaceItems.$inferSelect;
export type NewMarketplaceItem = typeof marketplaceItems.$inferInsert;
export type MarketplaceItemPrice = typeof marketplaceItemPrices.$inferSelect;
export type NewMarketplaceItemPrice = typeof marketplaceItemPrices.$inferInsert;
export type MarketplaceOrder = typeof marketplaceOrders.$inferSelect;
export type NewMarketplaceOrder = typeof marketplaceOrders.$inferInsert;
export type MarketplaceOrderLine = typeof marketplaceOrderLines.$inferSelect;
export type NewMarketplaceOrderLine = typeof marketplaceOrderLines.$inferInsert;
export type MarketplaceOrderStatusEvent =
  typeof marketplaceOrderStatusEvents.$inferSelect;
export type NewMarketplaceOrderStatusEvent =
  typeof marketplaceOrderStatusEvents.$inferInsert;
export type TeamMarketplaceEntitlement =
  typeof teamMarketplaceEntitlements.$inferSelect;
export type NewTeamMarketplaceEntitlement =
  typeof teamMarketplaceEntitlements.$inferInsert;

export type FeatureRequest = typeof featureRequests.$inferSelect;
export type NewFeatureRequest = typeof featureRequests.$inferInsert;
export type FeatureRequestVote = typeof featureRequestVotes.$inferSelect;
export type NewFeatureRequestVote = typeof featureRequestVotes.$inferInsert;

export type TeamPlugin = typeof teamPlugins.$inferSelect;
export type NewTeamPlugin = typeof teamPlugins.$inferInsert;
export type PluginSystemState = typeof pluginSystemStates.$inferSelect;
export type NewPluginSystemState = typeof pluginSystemStates.$inferInsert;
export type TeamMemberPlugin = typeof teamMemberPlugins.$inferSelect;
export type NewTeamMemberPlugin = typeof teamMemberPlugins.$inferInsert;
export type TeamSite = typeof teamSites.$inferSelect;
export type NewTeamSite = typeof teamSites.$inferInsert;
export type TeamSiteFile = typeof teamSiteFiles.$inferSelect;
export type NewTeamSiteFile = typeof teamSiteFiles.$inferInsert;
export const teamDomains = pgTable(
  "team_domains",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    registrar: varchar("registrar", { length: 100 }),
    expiresAt: timestamp("expires_at"),
    registeredAt: timestamp("registered_at"),
    autoRenew: boolean("auto_renew").notNull().default(false),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    contactId: integer("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    customerId: integer("customer_id").references(() => teamCustomers.id, {
      onDelete: "set null",
    }),
    notes: text("notes").notNull().default(""),
    price: integer("price"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    notifyDaysBefore: integer("notify_days_before").notNull().default(30),
    source: varchar("source", { length: 30 }).notNull().default("manual"),
    externalId: varchar("external_id", { length: 160 }),
    hostingerAccountId: integer("hostinger_account_id").references(() => hostingerAccounts.id, {
      onDelete: "set null",
    }),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: integer("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamDomainIdx: index("team_domains_team_idx").on(table.teamId),
    teamExpiresIdx: index("team_domains_expires_idx").on(table.teamId, table.expiresAt),
    teamDomainsCustomerIdx: index("team_domains_customer_idx").on(table.customerId),
    teamDomainsExternalUnique: uniqueIndex("team_domains_team_source_external_uidx")
      .on(table.teamId, table.source, table.externalId)
      .where(sql`${table.externalId} is not null`),
  }),
);

export const hostingerAccounts = pgTable(
  "hostinger_accounts",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    token: text("token").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("connected"),
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at"),
    domainsCount: integer("domains_count").notNull().default(0),
    connectedBy: integer("connected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    hostingerAccountsTeamIdx: index("hostinger_accounts_team_idx").on(table.teamId),
    hostingerAccountsLabelUnique: unique("hostinger_accounts_team_label_uidx").on(table.teamId, table.label),
  }),
);

export type HostingerAccount = typeof hostingerAccounts.$inferSelect;
export type NewHostingerAccount = typeof hostingerAccounts.$inferInsert;

export type TeamNote = typeof teamNotes.$inferSelect;
export type NewTeamNote = typeof teamNotes.$inferInsert;
export type TeamEvent = typeof teamEvents.$inferSelect;
export type NewTeamEvent = typeof teamEvents.$inferInsert;
export type TeamDomain = typeof teamDomains.$inferSelect;
export type NewTeamDomain = typeof teamDomains.$inferInsert;

export type ArticleTypeFieldConfig = {
  sku?: boolean;
  category?: boolean;
  unit?: boolean;
  tags?: boolean;
  description?: boolean;
};

export const teamArticleTypes = pgTable(
  "team_article_types",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    // physical | digital | membership | service | other
    kind: varchar("kind", { length: 30 }).notNull().default("physical"),
    // one_time | daily | weekly | monthly | yearly | installation | maintenance | custom
    billingMode: varchar("billing_mode", { length: 20 }).notNull().default("one_time"),
    billingLabel: varchar("billing_label", { length: 100 }),
    tracksStock: boolean("tracks_stock").notNull().default(true),
    // Campos "estándar" habilitados para artículos de este tipo (ausente = visible).
    fieldConfig: jsonb("field_config").$type<ArticleTypeFieldConfig>().notNull().default({}),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamArticleTypesTeamIdx: index("team_article_types_team_idx").on(table.teamId),
    teamArticleTypesNameUnique: unique("team_article_types_team_name_unique").on(table.teamId, table.name),
  }),
);

export type ArticleCustomFieldOption = {
  id: string;
  label: string;
  priceModifier: number;
};

export const teamArticleCustomFields = pgTable(
  "team_article_custom_fields",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    articleTypeId: integer("article_type_id")
      .notNull()
      .references(() => teamArticleTypes.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    key: varchar("key", { length: 100 }).notNull(),
    // text | number | boolean | select
    type: varchar("type", { length: 20 }).notNull().default("text"),
    required: boolean("required").notNull().default(false),
    // hasPrice solo tiene efecto para type='boolean' (usa `price`) y type='select' (usa `priceModifier` por opción).
    hasPrice: boolean("has_price").notNull().default(false),
    price: integer("price").notNull().default(0),
    options: jsonb("options").$type<ArticleCustomFieldOption[]>().notNull().default([]),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamArticleCustomFieldsTypeIdx: index("team_article_custom_fields_type_idx").on(table.articleTypeId),
    teamArticleCustomFieldsKeyUnique: unique("team_article_custom_fields_type_key_unique").on(table.articleTypeId, table.key),
  }),
);

export const teamArticleAttributes = pgTable(
  "team_article_attributes",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    values: jsonb("values").$type<string[]>().notNull().default([]),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamArticleAttributesTeamIdx: index("team_article_attributes_team_idx").on(table.teamId),
    teamArticleAttributesNameUnique: unique("team_article_attributes_team_name_unique").on(table.teamId, table.name),
  }),
);

export const teamArticles = pgTable(
  "team_articles",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    articleTypeId: integer("article_type_id").references(() => teamArticleTypes.id, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    sku: varchar("sku", { length: 100 }),
    price: integer("price").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    category: varchar("category", { length: 100 }),
    unit: varchar("unit", { length: 50 }).notNull().default("unidad"),
    stock: integer("stock"),
    imageUrl: text("image_url"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    // Valores de los campos personalizados del tipo, keyeados por `key`. Mismo patrón que contacts.customData.
    customFieldValues: jsonb("custom_field_values").$type<Record<string, string | number | boolean>>().notNull().default({}),
    // Ids de team_article_attributes que este artículo usa opcionalmente para generar variaciones.
    attributeIds: jsonb("attribute_ids").$type<number[]>().notNull().default([]),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamArticlesIdx: index("team_articles_team_idx").on(table.teamId),
    teamArticlesSkuIdx: index("team_articles_sku_idx").on(table.teamId, table.sku),
    teamArticlesTypeIdx: index("team_articles_type_idx").on(table.articleTypeId),
  }),
);

export const teamArticleVariations = pgTable(
  "team_article_variations",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => teamArticles.id, { onDelete: "cascade" }),
    // { "Color": "Rojo", "Talla": "M" }
    combination: jsonb("combination").$type<Record<string, string>>().notNull().default({}),
    sku: varchar("sku", { length: 100 }),
    // null = hereda el precio del artículo padre.
    price: integer("price"),
    stock: integer("stock"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamArticleVariationsArticleIdx: index("team_article_variations_article_idx").on(table.articleId),
  }),
);

export const teamArticlePlans = pgTable(
  "team_article_plans",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => teamArticles.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description").notNull().default(""),
    includedItems: jsonb("included_items").$type<string[]>().notNull().default([]),
    billingMode: varchar("billing_mode", { length: 20 }).notNull().default("monthly"),
    billingLabel: varchar("billing_label", { length: 100 }),
    price: integer("price").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    // Texto libre opcional: no existe una entidad "empresa" en el esquema.
    companyName: varchar("company_name", { length: 200 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamArticlePlansArticleIdx: index("team_article_plans_article_idx").on(table.articleId),
  }),
);

export const teamArticleTypesRelations = relations(teamArticleTypes, ({ many }) => ({
  articles: many(teamArticles),
  customFields: many(teamArticleCustomFields),
}));

export const teamArticleCustomFieldsRelations = relations(teamArticleCustomFields, ({ one }) => ({
  articleType: one(teamArticleTypes, {
    fields: [teamArticleCustomFields.articleTypeId],
    references: [teamArticleTypes.id],
  }),
}));

export const teamArticleAttributesRelations = relations(teamArticleAttributes, () => ({}));

export const teamArticlesRelations = relations(teamArticles, ({ one, many }) => ({
  articleType: one(teamArticleTypes, {
    fields: [teamArticles.articleTypeId],
    references: [teamArticleTypes.id],
  }),
  variations: many(teamArticleVariations),
  plans: many(teamArticlePlans),
}));

export const teamArticleVariationsRelations = relations(teamArticleVariations, ({ one }) => ({
  article: one(teamArticles, {
    fields: [teamArticleVariations.articleId],
    references: [teamArticles.id],
  }),
}));

export const teamArticlePlansRelations = relations(teamArticlePlans, ({ one }) => ({
  article: one(teamArticles, {
    fields: [teamArticlePlans.articleId],
    references: [teamArticles.id],
  }),
}));

export type SaleItem = {
  articleId: number | null;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export const teamSales = pgTable(
  "team_sales",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    saleNumber: varchar("sale_number", { length: 50 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    items: jsonb("items").$type<SaleItem[]>().notNull().default([]),
    subtotal: integer("subtotal").notNull().default(0),
    discountAmount: integer("discount_amount").notNull().default(0),
    taxAmount: integer("tax_amount").notNull().default(0),
    total: integer("total").notNull().default(0),
    notes: text("notes").notNull().default(""),
    paidAt: timestamp("paid_at"),
    dueDate: timestamp("due_date"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamSalesIdx: index("team_sales_team_idx").on(table.teamId),
    teamSalesContactIdx: index("team_sales_contact_idx").on(table.teamId, table.contactId),
    teamSalesStatusIdx: index("team_sales_status_idx").on(table.teamId, table.status),
  }),
);

// ─── Clientes (entidad real compartida por CRM e integraciones) ──────────────

export const teamCustomers = pgTable(
  "team_customers",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 80 }),
    source: varchar("source", { length: 30 }).notNull().default("manual"),
    externalId: varchar("external_id", { length: 160 }),
    externalData: jsonb("external_data").$type<Record<string, unknown>>().notNull().default({}),
    profileImage: text("profile_image"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    notes: text("notes").notNull().default(""),
    lastSyncedAt: timestamp("last_synced_at"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamCustomersTeamIdx: index("team_customers_team_idx").on(table.teamId),
    teamCustomersExternalUnique: unique("team_customers_team_source_external_uidx").on(table.teamId, table.source, table.externalId),
  }),
);

export const teamCustomerContacts = pgTable(
  "team_customer_contacts",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").notNull().references(() => teamCustomers.id, { onDelete: "cascade" }),
    contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamCustomerContactsUnique: unique("team_customer_contacts_customer_contact_uidx").on(table.customerId, table.contactId),
    teamCustomerContactsTeamIdx: index("team_customer_contacts_team_idx").on(table.teamId),
  }),
);

export const teamCustomerStores = pgTable(
  "team_customer_stores",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => teamCustomers.id, { onDelete: "set null" }),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    cardType: varchar("card_type", { length: 60 }),
    title: varchar("title", { length: 255 }),
    subTitle: text("sub_title"),
    cardUrl: text("card_url"),
    customDomain: text("custom_domain"),
    profileImage: text("profile_image"),
    status: varchar("status", { length: 30 }),
    whatsappPhone: varchar("whatsapp_phone", { length: 80 }),
    whatsappPhoneResolvedAt: timestamp("whatsapp_phone_resolved_at"),
    externalData: jsonb("external_data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamCustomerStoresExternalUnique: unique("team_customer_stores_team_external_uidx").on(table.teamId, table.externalId),
    teamCustomerStoresCustomerIdx: index("team_customer_stores_customer_idx").on(table.customerId),
  }),
);

export const teamCustomerTransactions = pgTable(
  "team_customer_transactions",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => teamCustomers.id, { onDelete: "set null" }),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    planExternalId: varchar("plan_external_id", { length: 160 }),
    amount: varchar("amount", { length: 80 }),
    currency: text("currency"),
    paymentStatus: varchar("payment_status", { length: 40 }),
    gateway: varchar("gateway", { length: 80 }),
    transactionDate: timestamp("transaction_date"),
    externalData: jsonb("external_data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamCustomerTransactionsExternalUnique: unique("team_customer_transactions_team_external_uidx").on(table.teamId, table.externalId),
    teamCustomerTransactionsCustomerIdx: index("team_customer_transactions_customer_idx").on(table.customerId),
  }),
);

// ─── Membresías (plugin memberships) ─────────────────────────────────────────
// App dedicada para vender membresías/suscripciones: empresas → planes (con
// características) → suscripciones asignadas a contactos de WhatsApp, con
// recordatorios de vencimiento enviados por el cron.

export const teamMembershipCompanies = pgTable(
  "team_membership_companies",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    logoUrl: text("logo_url"),
    website: text("website"),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 80 }),
    address: text("address"),
    externalSource: varchar("external_source", { length: 60 }),
    externalId: varchar("external_id", { length: 160 }),
    notes: text("notes").notNull().default(""),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    position: integer("position").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamMembershipCompaniesTeamIdx: index("team_membership_companies_team_idx").on(table.teamId),
    teamMembershipCompaniesExternalUnique: unique("team_membership_companies_team_external_uidx").on(table.teamId, table.externalSource, table.externalId),
  }),
);

// Característica de un plan: incluida / no incluida / por cantidad / personalizada.
export type MembershipFeature = {
  label: string;
  type: "included" | "excluded" | "quantity" | "custom";
  value?: string;
};

export const teamMembershipPlans = pgTable(
  "team_membership_plans",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => teamMembershipCompanies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    description: text("description").notNull().default(""),
    // free | monthly | annual | lifetime | setup_maintenance | custom
    billingType: varchar("billing_type", { length: 30 }).notNull().default("monthly"),
    // Monto principal recurrente/único (centavos).
    price: integer("price").notNull().default(0),
    // Pago inicial (centavos), para setup_maintenance.
    setupFee: integer("setup_fee").notNull().default(0),
    // Cuota de mantenimiento (centavos), para setup_maintenance.
    maintenanceAmount: integer("maintenance_amount").notNull().default(0),
    // Cada cuántos meses se cobra el mantenimiento / se renueva (custom).
    maintenanceIntervalMonths: integer("maintenance_interval_months"),
    billingLabel: varchar("billing_label", { length: 100 }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    features: jsonb("features").$type<MembershipFeature[]>().notNull().default([]),
    // public: visible en catálogos; private: solo visible para gestión interna.
    visibility: varchar("visibility", { length: 20 }).notNull().default("public"),
    externalSource: varchar("external_source", { length: 60 }),
    externalId: varchar("external_id", { length: 160 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    position: integer("position").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamMembershipPlansTeamIdx: index("team_membership_plans_team_idx").on(table.teamId),
    teamMembershipPlansVisibilityIdx: index("team_membership_plans_team_visibility_idx").on(table.teamId, table.visibility),
    teamMembershipPlansCompanyIdx: index("team_membership_plans_company_idx").on(table.companyId),
    teamMembershipPlansExternalUnique: unique("team_membership_plans_team_external_uidx").on(table.teamId, table.externalSource, table.externalId),
  }),
);

export type MembershipReminderLog = {
  ruleId: number;
  offsetDays: number;
  sentAt: string;
};

export const teamMembershipSubscriptions = pgTable(
  "team_membership_subscriptions",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    subscriptionNumber: varchar("subscription_number", { length: 50 }).notNull(),
    planId: integer("plan_id").references(() => teamMembershipPlans.id, { onDelete: "set null" }),
    companyId: integer("company_id").references(() => teamMembershipCompanies.id, { onDelete: "set null" }),
    customerId: integer("customer_id").references(() => teamCustomers.id, { onDelete: "set null" }),
    contactId: integer("contact_id")
      .references(() => contacts.id, { onDelete: "set null" }),
    externalSource: varchar("external_source", { length: 60 }),
    externalId: varchar("external_id", { length: 160 }),
    planNameSnapshot: varchar("plan_name_snapshot", { length: 150 }).notNull().default(""),
    price: integer("price").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    billingType: varchar("billing_type", { length: 30 }).notNull().default("monthly"),
    // active | pending | expired | cancelled
    status: varchar("status", { length: 20 }).notNull().default("active"),
    // paid | pending | overdue
    paymentStatus: varchar("payment_status", { length: 20 }).notNull().default("pending"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    // NULL para planes gratis / de por vida (sin vencimiento).
    endDate: date("end_date", { mode: "string" }),
    remindersSent: jsonb("reminders_sent").$type<MembershipReminderLog[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamMembershipSubsTeamIdx: index("team_membership_subscriptions_team_idx").on(table.teamId),
    teamMembershipSubsContactIdx: index("team_membership_subscriptions_contact_idx").on(table.contactId),
    teamMembershipSubsCustomerIdx: index("team_membership_subscriptions_customer_idx").on(table.customerId),
    teamMembershipSubsExternalUnique: unique("team_membership_subscriptions_team_external_uidx").on(table.teamId, table.externalSource, table.externalId),
    teamMembershipSubsDueIdx: index("team_membership_subscriptions_due_idx").on(table.endDate, table.status),
  }),
);

export const teamMembershipReminderRules = pgTable(
  "team_membership_reminder_rules",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    // Días respecto al vencimiento: negativo = antes, 0 = el día, positivo = después.
    offsetDays: integer("offset_days").notNull().default(0),
    // message | automation
    actionType: varchar("action_type", { length: 20 }).notNull().default("message"),
    message: text("message").notNull().default(""),
    mediaUrl: text("media_url"),
    automationId: integer("automation_id").references(() => automations.id, { onDelete: "set null" }),
    instanceId: integer("instance_id").references(() => evolutionInstances.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamMembershipReminderRulesTeamIdx: index("team_membership_reminder_rules_team_idx").on(table.teamId),
  }),
);

export const teamAappConnections = pgTable(
  "team_aapp_connections",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }).unique(),
    apiKey: text("api_key").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("disconnected"),
    companyId: integer("company_id").references(() => teamMembershipCompanies.id, { onDelete: "set null" }),
    lastSyncedAt: timestamp("last_synced_at"),
    lastSyncStatus: varchar("last_sync_status", { length: 20 }),
    lastSyncError: text("last_sync_error"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamAappConnectionsStatusIdx: index("team_aapp_connections_status_idx").on(table.status),
  }),
);

export type AappRenewalRuleKey = "before_30" | "before_14" | "before_3" | "expired";
export type AappRenewalRecipientSource = "account" | "website" | "store";
export type AappRenewalTemplates = Record<AappRenewalRuleKey, string>;

export const teamAappRenewalConfigs = pgTable(
  "team_aapp_renewal_configs",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }).unique(),
    enabled: boolean("enabled").notNull().default(false),
    instanceId: integer("instance_id").references(() => evolutionInstances.id, { onDelete: "set null" }),
    recipientSource: varchar("recipient_source", { length: 20 }).$type<AappRenewalRecipientSource>().notNull().default("account"),
    sendHour: integer("send_hour").notNull().default(9),
    sendMinute: integer("send_minute").notNull().default(0),
    timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
    templates: jsonb("templates").$type<AappRenewalTemplates>().notNull(),
    enabledRuleKeys: jsonb("enabled_rule_keys").$type<AappRenewalRuleKey[]>().notNull().default(["before_30", "before_14", "before_3", "expired"]),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamAappRenewalConfigsTeamIdx: index("team_aapp_renewal_configs_team_idx").on(table.teamId),
  }),
);

export const teamAappRenewalCandidates = pgTable(
  "team_aapp_renewal_candidates",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    subscriptionId: integer("subscription_id").notNull().references(() => teamMembershipSubscriptions.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => teamCustomers.id, { onDelete: "set null" }),
    ruleKey: varchar("rule_key", { length: 20 }).$type<AappRenewalRuleKey>().notNull(),
    expirationDate: date("expiration_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    sendAt: timestamp("send_at"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    requestedRecipientSource: varchar("requested_recipient_source", { length: 20 }).$type<AappRenewalRecipientSource>().notNull(),
    resolvedRecipientSource: varchar("resolved_recipient_source", { length: 20 }).$type<AappRenewalRecipientSource>(),
    recipientPhone: varchar("recipient_phone", { length: 80 }),
    recipientStoreId: integer("recipient_store_id").references(() => teamCustomerStores.id, { onDelete: "set null" }),
    usedAccountFallback: boolean("used_account_fallback").notNull().default(false),
    message: text("message").notNull(),
    instanceId: integer("instance_id").references(() => evolutionInstances.id, { onDelete: "set null" }),
    approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at"),
    rejectedBy: integer("rejected_by").references(() => users.id, { onDelete: "set null" }),
    rejectedAt: timestamp("rejected_at"),
    sentAt: timestamp("sent_at"),
    messageId: text("message_id"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamAappRenewalCandidatesUnique: unique("team_aapp_renewal_candidates_subscription_rule_expiry_uidx").on(
      table.teamId,
      table.subscriptionId,
      table.ruleKey,
      table.expirationDate,
    ),
    teamAappRenewalCandidatesQueueIdx: index("team_aapp_renewal_candidates_queue_idx").on(table.teamId, table.status, table.sendAt),
    teamAappRenewalCandidatesSubscriptionIdx: index("team_aapp_renewal_candidates_subscription_idx").on(table.subscriptionId),
  }),
);

// ─── Financiero (plugin finance) ─────────────────────────────────────────────
// Libro operativo compartido con Clientes, Membresías y AAPP SPACE. Todos los
// importes se guardan en la unidad mínima de la moneda (centavos).

export const teamFinancialEntries = pgTable(
  "team_financial_entries",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 12 }).$type<"income" | "expense">().notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    category: varchar("category", { length: 60 }).notNull(),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("ARS"),
    status: varchar("status", { length: 20 }).$type<"pending" | "paid" | "overdue" | "cancelled">().notNull().default("pending"),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    dueOn: date("due_on", { mode: "string" }),
    paidOn: date("paid_on", { mode: "string" }),
    recurrence: varchar("recurrence", { length: 20 }).$type<"none" | "monthly" | "annual">().notNull().default("none"),
    recurrenceEndOn: date("recurrence_end_on", { mode: "string" }),
    nextDueOn: date("next_due_on", { mode: "string" }),
    paymentMethod: varchar("payment_method", { length: 80 }),
    counterparty: varchar("counterparty", { length: 200 }),
    customerId: integer("customer_id").references(() => teamCustomers.id, { onDelete: "set null" }),
    companyId: integer("company_id").references(() => teamMembershipCompanies.id, { onDelete: "set null" }),
    planId: integer("plan_id").references(() => teamMembershipPlans.id, { onDelete: "set null" }),
    subscriptionId: integer("subscription_id").references(() => teamMembershipSubscriptions.id, { onDelete: "set null" }),
    saleId: integer("sale_id").references(() => teamSales.id, { onDelete: "set null" }),
    projectId: integer("project_id").references(() => teamTaskProjects.id, { onDelete: "set null" }),
    accountId: integer("account_id").references(() => teamFinancialAccounts.id, { onDelete: "set null" }),
    costCenterId: integer("cost_center_id").references(() => teamCostCenters.id, { onDelete: "set null" }),
    externalSource: varchar("external_source", { length: 60 }),
    externalId: varchar("external_id", { length: 160 }),
    externalData: jsonb("external_data").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamTypeDateIdx: index("team_financial_entries_team_type_date_idx").on(table.teamId, table.type, table.occurredOn),
    teamStatusDueIdx: index("team_financial_entries_team_status_due_idx").on(table.teamId, table.status, table.dueOn),
    customerIdx: index("team_financial_entries_customer_idx").on(table.customerId),
    subscriptionIdx: index("team_financial_entries_subscription_idx").on(table.subscriptionId),
    saleIdx: index("team_financial_entries_sale_idx").on(table.saleId),
    projectIdx: index("team_financial_entries_project_idx").on(table.projectId),
    accountIdx: index("team_financial_entries_account_idx").on(table.accountId),
    costCenterIdx: index("team_financial_entries_cost_center_idx").on(table.costCenterId),
    externalUnique: unique("team_financial_entries_team_external_uidx").on(table.teamId, table.externalSource, table.externalId),
  }),
);

export const teamFinancialReceipts = pgTable(
  "team_financial_receipts",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    entryId: integer("entry_id").references(() => teamFinancialEntries.id, { onDelete: "set null" }),
    messageId: text("message_id").references(() => messages.id, { onDelete: "set null" }),
    chatId: integer("chat_id").references(() => chats.id, { onDelete: "set null" }),
    mediaUrl: text("media_url").notNull(),
    mimeType: varchar("mime_type", { length: 160 }),
    fileName: varchar("file_name", { length: 255 }),
    documentDate: date("document_date", { mode: "string" }),
    paymentDate: date("payment_date", { mode: "string" }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    notes: text("notes").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamCreatedIdx: index("team_financial_receipts_team_created_idx").on(table.teamId, table.createdAt),
    entryIdx: index("team_financial_receipts_entry_idx").on(table.entryId),
    messageUnique: unique("team_financial_receipts_team_message_uidx").on(table.teamId, table.messageId),
  }),
);

export const teamFinancialAccounts = pgTable(
  "team_financial_accounts",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    type: varchar("type", { length: 20 })
      .$type<"cash" | "bank" | "mercadopago" | "stripe" | "paypal" | "other">()
      .notNull()
      .default("bank"),
    currency: varchar("currency", { length: 3 }).notNull().default("ARS"),
    openingBalance: integer("opening_balance").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamActiveIdx: index("team_financial_accounts_team_active_idx").on(table.teamId, table.isActive),
  }),
);

export const teamCostCenters = pgTable(
  "team_cost_centers",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    code: varchar("code", { length: 30 }),
    description: text("description").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamActiveIdx: index("team_cost_centers_team_active_idx").on(table.teamId, table.isActive),
    teamCodeUnique: unique("team_cost_centers_team_code_uidx").on(table.teamId, table.code),
  }),
);

export const teamBudgets = pgTable(
  "team_budgets",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    costCenterId: integer("cost_center_id").references(() => teamCostCenters.id, { onDelete: "set null" }),
    category: varchar("category", { length: 60 }),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("ARS"),
    notes: text("notes").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamPeriodIdx: index("team_budgets_team_period_idx").on(table.teamId, table.periodStart, table.periodEnd),
    costCenterIdx: index("team_budgets_cost_center_idx").on(table.costCenterId),
  }),
);

export const teamFinancialEntryPayments = pgTable(
  "team_financial_entry_payments",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    entryId: integer("entry_id").notNull().references(() => teamFinancialEntries.id, { onDelete: "cascade" }),
    accountId: integer("account_id").references(() => teamFinancialAccounts.id, { onDelete: "set null" }),
    amount: integer("amount").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    method: varchar("method", { length: 80 }),
    notes: text("notes").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    entryIdx: index("team_financial_entry_payments_entry_idx").on(table.entryId),
    teamPaidOnIdx: index("team_financial_entry_payments_team_paid_on_idx").on(table.teamId, table.paidOn),
  }),
);

export const teamExchangeRates = pgTable(
  "team_exchange_rates",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    quoteCurrency: varchar("quote_currency", { length: 3 }).notNull(),
    rate: decimal("rate", { precision: 18, scale: 6 }).notNull(),
    rateDate: date("rate_date", { mode: "string" }).notNull(),
    source: varchar("source", { length: 60 }).notNull().default("manual"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamPairDateUnique: unique("team_exchange_rates_team_pair_date_uidx").on(
      table.teamId,
      table.baseCurrency,
      table.quoteCurrency,
      table.rateDate,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Business OS Fase 2: Proveedores/Compras + RRHH/Comisiones
// ---------------------------------------------------------------------------

export const teamVendors = pgTable(
  "team_vendors",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    taxId: varchar("tax_id", { length: 60 }),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 40 }),
    address: text("address").notNull().default(""),
    notes: text("notes").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamActiveIdx: index("team_vendors_team_active_idx").on(table.teamId, table.isActive),
  }),
);

export const PURCHASE_ORDER_STATUSES = ["draft", "sent", "confirmed", "received", "cancelled"] as const;

export const teamPurchaseOrders = pgTable(
  "team_purchase_orders",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    vendorId: integer("vendor_id").notNull().references(() => teamVendors.id, { onDelete: "restrict" }),
    orderNumber: varchar("order_number", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 })
      .$type<(typeof PURCHASE_ORDER_STATUSES)[number]>()
      .notNull()
      .default("draft"),
    currency: varchar("currency", { length: 3 }).notNull().default("ARS"),
    subtotalAmount: integer("subtotal_amount").notNull().default(0),
    taxAmount: integer("tax_amount").notNull().default(0),
    totalAmount: integer("total_amount").notNull().default(0),
    expectedDate: date("expected_date", { mode: "string" }),
    receivedDate: date("received_date", { mode: "string" }),
    notes: text("notes").notNull().default(""),
    financeEntryId: integer("finance_entry_id").references(() => teamFinancialEntries.id, { onDelete: "set null" }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamStatusIdx: index("team_purchase_orders_team_status_idx").on(table.teamId, table.status),
    vendorIdx: index("team_purchase_orders_vendor_idx").on(table.vendorId),
    teamNumberUnique: unique("team_purchase_orders_team_number_uidx").on(table.teamId, table.orderNumber),
  }),
);

export const teamPurchaseOrderItems = pgTable(
  "team_purchase_order_items",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    purchaseOrderId: integer("purchase_order_id").notNull().references(() => teamPurchaseOrders.id, { onDelete: "cascade" }),
    articleId: integer("article_id").references(() => teamArticles.id, { onDelete: "set null" }),
    description: varchar("description", { length: 300 }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitAmount: integer("unit_amount").notNull().default(0),
    totalAmount: integer("total_amount").notNull().default(0),
    receivedQuantity: integer("received_quantity").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    poIdx: index("team_purchase_order_items_po_idx").on(table.purchaseOrderId),
  }),
);

export const EMPLOYMENT_STATUSES = ["active", "on_leave", "terminated"] as const;

export const teamEmployeeProfiles = pgTable(
  "team_employee_profiles",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    jobTitle: varchar("job_title", { length: 160 }),
    employmentStatus: varchar("employment_status", { length: 20 })
      .$type<(typeof EMPLOYMENT_STATUSES)[number]>()
      .notNull()
      .default("active"),
    hireDate: date("hire_date", { mode: "string" }),
    notes: text("notes").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamStatusIdx: index("team_employee_profiles_team_status_idx").on(table.teamId, table.employmentStatus),
    teamUserUnique: unique("team_employee_profiles_team_user_uidx").on(table.teamId, table.userId),
  }),
);

export const COMMISSION_RULE_TARGETS = ["all_sales", "article", "user"] as const;

export const teamCommissionRules = pgTable(
  "team_commission_rules",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    rateBps: integer("rate_bps").notNull(),
    appliesTo: varchar("applies_to", { length: 20 })
      .$type<(typeof COMMISSION_RULE_TARGETS)[number]>()
      .notNull()
      .default("all_sales"),
    articleId: integer("article_id").references(() => teamArticles.id, { onDelete: "set null" }),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamActiveIdx: index("team_commission_rules_team_active_idx").on(table.teamId, table.isActive),
  }),
);

export const SALE_COMMISSION_STATUSES = ["pending", "approved", "paid", "cancelled"] as const;

export const teamSaleCommissions = pgTable(
  "team_sale_commissions",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    saleId: integer("sale_id").notNull().references(() => teamSales.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ruleId: integer("rule_id").references(() => teamCommissionRules.id, { onDelete: "set null" }),
    basisAmount: integer("basis_amount").notNull(),
    commissionAmount: integer("commission_amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("ARS"),
    status: varchar("status", { length: 20 })
      .$type<(typeof SALE_COMMISSION_STATUSES)[number]>()
      .notNull()
      .default("pending"),
    financeEntryId: integer("finance_entry_id").references(() => teamFinancialEntries.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamStatusIdx: index("team_sale_commissions_team_status_idx").on(table.teamId, table.status),
    userIdx: index("team_sale_commissions_user_idx").on(table.teamId, table.userId),
    teamSaleUserUnique: unique("team_sale_commissions_team_sale_user_uidx").on(table.teamId, table.saleId, table.userId),
  }),
);

export type TeamVendor = typeof teamVendors.$inferSelect;
export type NewTeamVendor = typeof teamVendors.$inferInsert;
export type TeamPurchaseOrder = typeof teamPurchaseOrders.$inferSelect;
export type NewTeamPurchaseOrder = typeof teamPurchaseOrders.$inferInsert;
export type TeamPurchaseOrderItem = typeof teamPurchaseOrderItems.$inferSelect;
export type NewTeamPurchaseOrderItem = typeof teamPurchaseOrderItems.$inferInsert;
export type TeamEmployeeProfile = typeof teamEmployeeProfiles.$inferSelect;
export type NewTeamEmployeeProfile = typeof teamEmployeeProfiles.$inferInsert;
export type TeamCommissionRule = typeof teamCommissionRules.$inferSelect;
export type NewTeamCommissionRule = typeof teamCommissionRules.$inferInsert;
export type TeamSaleCommission = typeof teamSaleCommissions.$inferSelect;
export type NewTeamSaleCommission = typeof teamSaleCommissions.$inferInsert;

// ---------------------------------------------------------------------------
// Business OS Fase 3: Soporte/Postventa + Contratos
// ---------------------------------------------------------------------------

export const SUPPORT_TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const SUPPORT_TICKET_STATUSES = ["open", "in_progress", "waiting_customer", "resolved", "closed", "cancelled"] as const;

export const teamSupportTickets = pgTable(
  "team_support_tickets",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => teamCustomers.id, { onDelete: "set null" }),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    chatId: integer("chat_id").references(() => chats.id, { onDelete: "set null" }),
    category: varchar("category", { length: 60 }),
    priority: varchar("priority", { length: 10 })
      .$type<(typeof SUPPORT_TICKET_PRIORITIES)[number]>()
      .notNull()
      .default("normal"),
    status: varchar("status", { length: 20 })
      .$type<(typeof SUPPORT_TICKET_STATUSES)[number]>()
      .notNull()
      .default("open"),
    subject: varchar("subject", { length: 300 }).notNull(),
    description: text("description").notNull().default(""),
    resolution: text("resolution").notNull().default(""),
    assignedUserId: integer("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at"),
    resolvedAt: timestamp("resolved_at"),
    closedAt: timestamp("closed_at"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamStatusIdx: index("team_support_tickets_team_status_idx").on(table.teamId, table.status),
    teamAssignedIdx: index("team_support_tickets_team_assigned_idx").on(table.teamId, table.assignedUserId),
    customerIdx: index("team_support_tickets_customer_idx").on(table.customerId),
    contactIdx: index("team_support_tickets_contact_idx").on(table.contactId),
  }),
);

export const teamSupportTicketComments = pgTable(
  "team_support_ticket_comments",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    ticketId: integer("ticket_id").notNull().references(() => teamSupportTickets.id, { onDelete: "cascade" }),
    authorUserId: integer("author_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    isInternal: boolean("is_internal").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    ticketIdx: index("team_support_ticket_comments_ticket_idx").on(table.ticketId),
  }),
);

export const CONTRACT_STATUSES = ["draft", "active", "expiring", "expired", "cancelled", "renewed"] as const;

export const teamContracts = pgTable(
  "team_contracts",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    customerId: integer("customer_id").references(() => teamCustomers.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull().default(""),
    value: integer("value").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("ARS"),
    status: varchar("status", { length: 20 })
      .$type<(typeof CONTRACT_STATUSES)[number]>()
      .notNull()
      .default("draft"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    autoRenew: boolean("auto_renew").notNull().default(false),
    documentId: integer("document_id").references(() => teamDocuments.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamStatusIdx: index("team_contracts_team_status_idx").on(table.teamId, table.status),
    customerIdx: index("team_contracts_customer_idx").on(table.customerId),
    teamEndDateIdx: index("team_contracts_team_end_date_idx").on(table.teamId, table.endDate),
  }),
);

export type TeamSupportTicket = typeof teamSupportTickets.$inferSelect;
export type NewTeamSupportTicket = typeof teamSupportTickets.$inferInsert;
export type TeamSupportTicketComment = typeof teamSupportTicketComments.$inferSelect;
export type NewTeamSupportTicketComment = typeof teamSupportTicketComments.$inferInsert;
export type TeamContract = typeof teamContracts.$inferSelect;
export type NewTeamContract = typeof teamContracts.$inferInsert;

export const teamMembershipCompaniesRelations = relations(teamMembershipCompanies, ({ many }) => ({
  plans: many(teamMembershipPlans),
}));

export const teamMembershipPlansRelations = relations(teamMembershipPlans, ({ one, many }) => ({
  company: one(teamMembershipCompanies, {
    fields: [teamMembershipPlans.companyId],
    references: [teamMembershipCompanies.id],
  }),
  subscriptions: many(teamMembershipSubscriptions),
}));

export const teamMembershipSubscriptionsRelations = relations(teamMembershipSubscriptions, ({ one }) => ({
  plan: one(teamMembershipPlans, {
    fields: [teamMembershipSubscriptions.planId],
    references: [teamMembershipPlans.id],
  }),
  company: one(teamMembershipCompanies, {
    fields: [teamMembershipSubscriptions.companyId],
    references: [teamMembershipCompanies.id],
  }),
  contact: one(contacts, {
    fields: [teamMembershipSubscriptions.contactId],
    references: [contacts.id],
  }),
  customer: one(teamCustomers, {
    fields: [teamMembershipSubscriptions.customerId],
    references: [teamCustomers.id],
  }),
}));

export type TeamMembershipCompany = typeof teamMembershipCompanies.$inferSelect;
export type NewTeamMembershipCompany = typeof teamMembershipCompanies.$inferInsert;
export type TeamMembershipPlan = typeof teamMembershipPlans.$inferSelect;
export type NewTeamMembershipPlan = typeof teamMembershipPlans.$inferInsert;
export type TeamMembershipSubscription = typeof teamMembershipSubscriptions.$inferSelect;
export type NewTeamMembershipSubscription = typeof teamMembershipSubscriptions.$inferInsert;
export type TeamMembershipReminderRule = typeof teamMembershipReminderRules.$inferSelect;
export type NewTeamMembershipReminderRule = typeof teamMembershipReminderRules.$inferInsert;
export type TeamCustomer = typeof teamCustomers.$inferSelect;
export type NewTeamCustomer = typeof teamCustomers.$inferInsert;
export type TeamCustomerStore = typeof teamCustomerStores.$inferSelect;
export type TeamCustomerTransaction = typeof teamCustomerTransactions.$inferSelect;
export type TeamAappConnection = typeof teamAappConnections.$inferSelect;
export type TeamAappRenewalConfig = typeof teamAappRenewalConfigs.$inferSelect;
export type TeamAappRenewalCandidate = typeof teamAappRenewalCandidates.$inferSelect;

export type TeamArticle = typeof teamArticles.$inferSelect;
export type NewTeamArticle = typeof teamArticles.$inferInsert;
export type TeamArticleType = typeof teamArticleTypes.$inferSelect;
export type NewTeamArticleType = typeof teamArticleTypes.$inferInsert;
export type TeamArticleCustomField = typeof teamArticleCustomFields.$inferSelect;
export type NewTeamArticleCustomField = typeof teamArticleCustomFields.$inferInsert;
export type TeamArticleAttribute = typeof teamArticleAttributes.$inferSelect;
export type NewTeamArticleAttribute = typeof teamArticleAttributes.$inferInsert;
export type TeamArticleVariation = typeof teamArticleVariations.$inferSelect;
export type NewTeamArticleVariation = typeof teamArticleVariations.$inferInsert;
export type TeamArticlePlan = typeof teamArticlePlans.$inferSelect;
export type NewTeamArticlePlan = typeof teamArticlePlans.$inferInsert;
export type TeamSale = typeof teamSales.$inferSelect;
export type NewTeamSale = typeof teamSales.$inferInsert;

// ──────────────────── Task OS (Projects / Columns / Items / Comments) ────────────────────

export type TaskLabel = { id: string; name: string; color: string };
export type TaskChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
  sourceTaskId?: number;
  sourceSnapshot?: {
    title: string;
    notes?: string;
    dueDate?: string | null;
  };
};

export const dashboardBookmarkGroups = pgTable(
  "dashboard_bookmark_groups",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    funnelStageGroupId: integer("funnel_stage_group_id").references(() => funnelStageGroups.id, { onDelete: "set null" }),
    name: varchar("name", { length: 120 }).notNull(),
    color: varchar("color", { length: 20 }).notNull().default("#2563EB"),
    order: integer("order").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamIdx: index("dashboard_bookmark_groups_team_idx").on(table.teamId),
    teamOrderIdx: index("dashboard_bookmark_groups_team_order_idx").on(table.teamId, table.order),
    teamFunnelGroupIdx: index("dashboard_bookmark_groups_team_funnel_group_idx").on(table.teamId, table.funnelStageGroupId),
  }),
);

export const teamTaskWorkspaces = pgTable(
  "team_task_workspaces",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    order: integer("order").notNull().default(0),
    color: varchar("color", { length: 20 }),
    icon: varchar("icon", { length: 60 }),
    embedToken: varchar("embed_token", { length: 64 }).unique(),
    embedEnabled: boolean("embed_enabled").notNull().default(false),
    embedAccess: varchar("embed_access", { length: 16 }).notNull().default("manage"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamTaskWorkspacesTeamIdx: index("team_task_workspaces_team_idx").on(table.teamId),
  }),
);

export const teamTaskProjects = pgTable(
  "team_task_projects",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    workspaceId: integer("workspace_id").references(() => teamTaskWorkspaces.id, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    backgroundUrl: text("background_url"),
    labels: jsonb("labels").$type<TaskLabel[]>().notNull().default([]),
    order: integer("order").notNull().default(0),
    color: varchar("color", { length: 20 }),
    icon: varchar("icon", { length: 60 }),
    embedToken: varchar("embed_token", { length: 64 }).unique(),
    embedEnabled: boolean("embed_enabled").notNull().default(false),
    embedAccess: varchar("embed_access", { length: 16 }).notNull().default("manage"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamTaskProjectsIdx: index("team_task_projects_team_idx").on(table.teamId),
  }),
);

export const dashboardBookmarkItems = pgTable(
  "dashboard_bookmark_items",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    groupId: integer("group_id").notNull().references(() => dashboardBookmarkGroups.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    chatId: integer("chat_id").references(() => chats.id, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => teamTaskProjects.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamIdx: index("dashboard_bookmark_items_team_idx").on(table.teamId),
    groupOrderIdx: index("dashboard_bookmark_items_group_order_idx").on(table.groupId, table.order),
    groupChatUnique: unique("dashboard_bookmark_items_group_chat_uidx").on(table.groupId, table.chatId),
    groupProjectUnique: unique("dashboard_bookmark_items_group_project_uidx").on(table.groupId, table.projectId),
  }),
);

export const teamTaskColumns = pgTable(
  "team_task_columns",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull().references(() => teamTaskProjects.id, { onDelete: "cascade" }),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    order: integer("order").notNull().default(0),
    color: varchar("color", { length: 20 }),
    icon: varchar("icon", { length: 60 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamTaskColumnsProjectIdx: index("team_task_columns_project_idx").on(table.projectId),
  }),
);

export const teamTaskItems = pgTable(
  "team_task_items",
  {
    id: serial("id").primaryKey(),
    columnId: integer("column_id").notNull().references(() => teamTaskColumns.id, { onDelete: "cascade" }),
    projectId: integer("project_id").notNull().references(() => teamTaskProjects.id, { onDelete: "cascade" }),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    notes: text("notes").notNull().default(""),
    labelIds: jsonb("label_ids").$type<string[]>().notNull().default([]),
    checklist: jsonb("checklist").$type<TaskChecklistItem[]>().notNull().default([]),
    status: varchar("status", { length: 30 }).notNull().default("open"),
    completedAt: timestamp("completed_at"),
    parentTaskId: integer("parent_task_id"),
    order: integer("order").notNull().default(0),
    dueDate: timestamp("due_date"),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    color: varchar("color", { length: 20 }),
    icon: varchar("icon", { length: 60 }),
    coverMediaId: integer("cover_media_id").references(() => teamTaskMedia.id, { onDelete: "set null" }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    assigneeId: integer("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamTaskItemsColumnIdx: index("team_task_items_column_idx").on(table.columnId),
    teamTaskItemsProjectIdx: index("team_task_items_project_idx").on(table.projectId),
    teamTaskItemsParentIdx: index("team_task_items_parent_idx").on(table.parentTaskId),
    teamTaskItemsStatusIdx: index("team_task_items_status_idx").on(table.teamId, table.status),
    teamTaskItemsDueIdx: index("team_task_items_due_idx").on(table.teamId, table.dueDate),
    teamTaskItemsScheduleIdx: index("team_task_items_schedule_idx").on(table.teamId, table.startDate, table.endDate),
    teamTaskItemsAssigneeIdx: index("team_task_items_assignee_idx").on(table.teamId, table.assigneeId),
  }),
);

export const teamTaskItemLocations = pgTable(
  "team_task_item_locations",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").notNull().references(() => teamTaskItems.id, { onDelete: "cascade" }),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    projectId: integer("project_id").notNull().references(() => teamTaskProjects.id, { onDelete: "cascade" }),
    columnId: integer("column_id").notNull().references(() => teamTaskColumns.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamTaskItemLocationsUnique: unique("team_task_item_locations_task_project_uidx").on(table.taskId, table.projectId),
    teamTaskItemLocationsTaskIdx: index("team_task_item_locations_task_idx").on(table.taskId),
    teamTaskItemLocationsProjectColumnIdx: index("team_task_item_locations_project_column_idx").on(table.projectId, table.columnId),
  }),
);

export const teamTaskRelations = pgTable(
  "team_task_relations",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 30 }).notNull(),
    sourceId: integer("source_id").notNull(),
    targetType: varchar("target_type", { length: 30 }).notNull(),
    targetId: integer("target_id").notNull(),
    relationType: varchar("relation_type", { length: 40 }).notNull().default("related"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamTaskRelationsUnique: unique("team_task_relations_uidx").on(table.teamId, table.sourceType, table.sourceId, table.targetType, table.targetId, table.relationType),
    teamTaskRelationsSourceIdx: index("team_task_relations_source_idx").on(table.teamId, table.sourceType, table.sourceId),
    teamTaskRelationsTargetIdx: index("team_task_relations_target_idx").on(table.teamId, table.targetType, table.targetId),
  }),
);

export const teamTaskDependencies = pgTable(
  "team_task_dependencies",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    taskId: integer("task_id").notNull().references(() => teamTaskItems.id, { onDelete: "cascade" }),
    dependsOnTaskId: integer("depends_on_task_id").notNull().references(() => teamTaskItems.id, { onDelete: "cascade" }),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamTaskDependenciesUnique: unique("team_task_dependencies_uidx").on(table.taskId, table.dependsOnTaskId),
    teamTaskDependenciesTaskIdx: index("team_task_dependencies_task_idx").on(table.teamId, table.taskId),
  }),
);

export const teamTaskMedia = pgTable(
  "team_task_media",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    ownerType: varchar("owner_type", { length: 30 }).notNull(),
    ownerId: integer("owner_id").notNull(),
    url: text("url").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 180 }),
    size: integer("size"),
    source: varchar("source", { length: 30 }).notNull().default("upload"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamTaskMediaOwnerIdx: index("team_task_media_owner_idx").on(table.teamId, table.ownerType, table.ownerId),
    teamTaskMediaUrlIdx: index("team_task_media_url_idx").on(table.teamId, table.url),
  }),
);

export const teamTaskTemplates = pgTable(
  "team_task_templates",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 30 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamTaskTemplatesTeamTypeIdx: index("team_task_templates_team_type_idx").on(table.teamId, table.type),
  }),
);

export const teamTaskComments = pgTable(
  "team_task_comments",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id").notNull().references(() => teamTaskItems.id, { onDelete: "cascade" }),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    teamTaskCommentsTaskIdx: index("team_task_comments_task_idx").on(table.taskId),
  }),
);

export type TeamTaskProject = typeof teamTaskProjects.$inferSelect;
export type DashboardBookmarkGroup = typeof dashboardBookmarkGroups.$inferSelect;
export type DashboardBookmarkItem = typeof dashboardBookmarkItems.$inferSelect;
export type TeamMenuItem = typeof teamMenuItems.$inferSelect;
export type NewTeamMenuItem = typeof teamMenuItems.$inferInsert;
export type TeamTaskColumn = typeof teamTaskColumns.$inferSelect;
export type TeamTaskItem = typeof teamTaskItems.$inferSelect;
export type TeamTaskItemLocation = typeof teamTaskItemLocations.$inferSelect;
export type TeamTaskRelation = typeof teamTaskRelations.$inferSelect;
export type TeamTaskDependency = typeof teamTaskDependencies.$inferSelect;
export type TeamTaskMedia = typeof teamTaskMedia.$inferSelect;
export type TeamTaskTemplate = typeof teamTaskTemplates.$inferSelect;
export type TeamTaskComment = typeof teamTaskComments.$inferSelect;
export type TeamNotification = typeof teamNotifications.$inferSelect;
export type NewTeamNotification = typeof teamNotifications.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type ReadOnlyApiToken = typeof readOnlyApiTokens.$inferSelect;
export type NewReadOnlyApiToken = typeof readOnlyApiTokens.$inferInsert;

export type CustomField = typeof customFields.$inferSelect;
export type NewCustomField = typeof customFields.$inferInsert;

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type DepartmentMember = typeof departmentMembers.$inferSelect;
export type NewDepartmentMember = typeof departmentMembers.$inferInsert;

export type MessageDraftCategory = typeof messageDraftCategories.$inferSelect;
export type NewMessageDraftCategory = typeof messageDraftCategories.$inferInsert;
export type MessageDraftTag = typeof messageDraftTags.$inferSelect;
export type NewMessageDraftTag = typeof messageDraftTags.$inferInsert;
export type MessageDraft = typeof messageDrafts.$inferSelect;
export type NewMessageDraft = typeof messageDrafts.$inferInsert;
export type MessageDraftTagLink = typeof messageDraftTagLinks.$inferSelect;
export type NewMessageDraftTagLink = typeof messageDraftTagLinks.$inferInsert;

export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;

export enum ActivityType {
  SIGN_UP = "SIGN_UP",
  SIGN_IN = "SIGN_IN",
  SIGN_OUT = "SIGN_OUT",
  UPDATE_PASSWORD = "UPDATE_PASSWORD",
  DELETE_ACCOUNT = "DELETE_ACCOUNT",
  UPDATE_ACCOUNT = "UPDATE_ACCOUNT",
  CREATE_TEAM = "CREATE_TEAM",
  REMOVE_TEAM_MEMBER = "REMOVE_TEAM_MEMBER",
  INVITE_TEAM_MEMBER = "INVITE_TEAM_MEMBER",
  ACCEPT_INVITATION = "ACCEPT_INVITATION",
  CREATE_INSTANCE = "CREATE_INSTANCE",
  DELETE_INSTANCE = "DELETE_INSTANCE",
  LOGOUT_INSTANCE = "LOGOUT_INSTANCE",
  CREATE_CONTACT = "CREATE_CONTACT",
  ASSIGN_AGENT = "ASSIGN_AGENT",
  ASSIGN_DEPARTMENT = "ASSIGN_DEPARTMENT",
  CHANGE_FUNNEL_STAGE = "CHANGE_FUNNEL_STAGE",
  ADD_TAG = "ADD_TAG",
  REMOVE_TAG = "REMOVE_TAG",
}

// ──────────────────── Mensajes Programados (Scheduled Messages) ────────────────────

export const teamScheduledMessages = pgTable("team_scheduled_messages", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("active"), // active | paused | completed | failed
  // Targeting
  instanceId: integer("instance_id").references(() => evolutionInstances.id, { onDelete: "set null" }),
  targetNumbers: jsonb("target_numbers").$type<string[]>().notNull().default([]),
  // Scheduling
  scheduleType: varchar("schedule_type", { length: 20 }).notNull().default("once"), // once | daily | weekly
  scheduledAt: timestamp("scheduled_at"),   // for 'once'
  hour: integer("hour"),                     // 0-23 for daily/weekly
  minute: integer("minute"),                 // 0-59 for daily/weekly
  weekdays: jsonb("weekdays").$type<number[]>().notNull().default([]), // 0-6 for weekly (0=Sunday)
  // Action
  actionType: varchar("action_type", { length: 20 }).notNull().default("message"), // message | automation
  message: text("message"),
  mediaUrl: text("media_url"),
  automationId: integer("automation_id").references(() => automations.id, { onDelete: "set null" }),
  // Tracking
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  runCount: integer("run_count").notNull().default(0),
  maxRuns: integer("max_runs"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  scheduledMessagesTeamIdx: index("scheduled_messages_team_idx").on(table.teamId),
  scheduledMessagesNextRunIdx: index("scheduled_messages_next_run_idx").on(table.nextRunAt, table.status),
}));

export type TeamScheduledMessage = typeof teamScheduledMessages.$inferSelect;
export type NewTeamScheduledMessage = typeof teamScheduledMessages.$inferInsert;

// ─── Mini Apps ───────────────────────────────────────────────────────────────

export const miniAppInstalls = pgTable("mini_app_installs", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  appSlug: varchar("app_slug", { length: 100 }).notNull(),
  installedBy: integer("installed_by").references(() => users.id, { onDelete: "set null" }),
  installedAt: timestamp("installed_at").notNull().defaultNow(),
}, (table) => ({
  miniAppInstallsUnique: unique("mini_app_installs_unique").on(table.teamId, table.appSlug),
  miniAppInstallsTeamIdx: index("mini_app_installs_team_idx").on(table.teamId),
}));

export const miniAppRecords = pgTable("mini_app_records", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  appSlug: varchar("app_slug", { length: 100 }).notNull(),
  collection: varchar("collection", { length: 100 }).notNull(),
  recordId: varchar("record_id", { length: 100 }).notNull(),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  miniAppRecordsUnique: unique("mini_app_records_unique").on(table.teamId, table.appSlug, table.collection, table.recordId),
  miniAppRecordsLookupIdx: index("mini_app_records_lookup_idx").on(table.teamId, table.appSlug, table.collection),
}));

export type MiniAppInstall = typeof miniAppInstalls.$inferSelect;
export type MiniAppRecord = typeof miniAppRecords.$inferSelect;

// ─── Form Builder ────────────────────────────────────────────────────────────

export const formBuilderForms = pgTable(
  "form_builder_forms",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    instanceId: integer("instance_id").references(() => evolutionInstances.id, { onDelete: "set null" }),
    publicId: varchar("public_id", { length: 64 }).notNull().unique(),
    slug: varchar("slug", { length: 180 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    fields: jsonb("fields")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    style: jsonb("style")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    submitButtonLabel: varchar("submit_button_label", { length: 80 }).notNull().default("Enviar"),
    successMessage: text("success_message").notNull().default("Gracias. Recibimos tus datos correctamente."),
    confirmationMessage: text("confirmation_message")
      .notNull()
      .default("Hola {{nombre}}, recibimos tus datos de {{formulario}}.\n\n{{datos}}"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    formBuilderFormsTeamStatusIdx: index("form_builder_forms_team_status_idx").on(table.teamId, table.status),
    formBuilderFormsPublicIdx: index("form_builder_forms_public_idx").on(table.publicId),
    formBuilderFormsTeamSlugUnique: unique("form_builder_forms_team_slug_uidx").on(table.teamId, table.slug),
  }),
);

export const formBuilderSubmissions = pgTable(
  "form_builder_submissions",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    formId: integer("form_id")
      .notNull()
      .references(() => formBuilderForms.id, { onDelete: "cascade" }),
    instanceId: integer("instance_id").references(() => evolutionInstances.id, { onDelete: "set null" }),
    contactName: varchar("contact_name", { length: 200 }),
    contactPhone: varchar("contact_phone", { length: 60 }),
    contactJid: varchar("contact_jid", { length: 120 }),
    data: jsonb("data")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: varchar("status", { length: 30 }).notNull().default("new"),
    messageStatus: varchar("message_status", { length: 30 }).notNull().default("pending"),
    messageId: text("message_id"),
    messageError: text("message_error"),
    reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at"),
    sourceIp: varchar("source_ip", { length: 120 }),
    userAgent: text("user_agent"),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    formBuilderSubmissionsTeamStatusIdx: index("form_builder_submissions_team_status_idx").on(table.teamId, table.status),
    formBuilderSubmissionsFormIdx: index("form_builder_submissions_form_idx").on(table.formId),
    formBuilderSubmissionsSubmittedIdx: index("form_builder_submissions_submitted_idx").on(table.teamId, table.submittedAt),
  }),
);

export type FormBuilderForm = typeof formBuilderForms.$inferSelect;
export type NewFormBuilderForm = typeof formBuilderForms.$inferInsert;
export type FormBuilderSubmission = typeof formBuilderSubmissions.$inferSelect;
export type NewFormBuilderSubmission = typeof formBuilderSubmissions.$inferInsert;

// ─── Social Publisher (Facebook / Instagram) ─────────────────────────────────

export const socialAccounts = pgTable("social_accounts", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 20 }).notNull(), // facebook_page | instagram
  externalId: text("external_id").notNull(),               // page-id / ig-user-id
  name: text("name").notNull(),
  username: text("username"),
  pictureUrl: text("picture_url"),
  accessToken: text("access_token").notNull(),             // Page Access Token (IG usa el de su Page vinculada)
  tokenExpiresAt: timestamp("token_expires_at"),           // null = no expira
  linkedFacebookPageId: text("linked_facebook_page_id"),
  status: varchar("status", { length: 20 }).notNull().default("active"), // active | token_expired | disconnected
  connectedBy: integer("connected_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  socialAccountsTeamIdx: index("social_accounts_team_idx").on(table.teamId),
  socialAccountsUnique: unique("social_accounts_team_platform_ext").on(table.teamId, table.platform, table.externalId),
}));

export type SocialMediaItem = { url: string; type: "image" | "video"; order: number };

export const socialPosts = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  // draft | scheduled | publishing | published | partially_published | failed
  format: varchar("format", { length: 20 }).notNull().default("post"), // post | reel | story
  caption: text("caption"),
  link: text("link"),                                       // link post (solo Facebook)
  mediaItems: jsonb("media_items").$type<SocialMediaItem[]>().notNull().default([]),
  scheduledAt: timestamp("scheduled_at"),                   // null = publicar ahora
  timezone: varchar("timezone", { length: 64 }),            // IANA tz, solo para mostrar en UI
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  socialPostsTeamIdx: index("social_posts_team_idx").on(table.teamId),
  socialPostsDueIdx: index("social_posts_due_idx").on(table.status, table.scheduledAt),
}));

export const socialPostTargets = pgTable("social_post_targets", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => socialPosts.id, { onDelete: "cascade" }),
  socialAccountId: integer("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 20 }).notNull(),  // desnormalizado para el cron
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  // pending | publishing | awaiting_container | published | failed
  igContainerId: text("ig_container_id"),
  publishedExternalId: text("published_external_id"),
  permalink: text("permalink"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  errorMessage: text("error_message"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  socialTargetsPostIdx: index("social_targets_post_idx").on(table.postId),
  socialTargetsStatusIdx: index("social_targets_status_idx").on(table.status),
}));

export const socialPostsRelations = relations(socialPosts, ({ many }) => ({
  targets: many(socialPostTargets),
}));

export const socialPostTargetsRelations = relations(socialPostTargets, ({ one }) => ({
  post: one(socialPosts, {
    fields: [socialPostTargets.postId],
    references: [socialPosts.id],
  }),
  account: one(socialAccounts, {
    fields: [socialPostTargets.socialAccountId],
    references: [socialAccounts.id],
  }),
}));

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;
export type SocialPost = typeof socialPosts.$inferSelect;
export type NewSocialPost = typeof socialPosts.$inferInsert;
export type SocialPostTarget = typeof socialPostTargets.$inferSelect;
export type NewSocialPostTarget = typeof socialPostTargets.$inferInsert;

// ─── App CAMPAÑAS (Meta Ads) ─────────────────────────────────────────────────

export const metaAdsTokens = pgTable(
  "meta_ads_tokens",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    token: text("token").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("active"), // active | invalid
    lastError: text("last_error"),
    lastValidatedAt: timestamp("last_validated_at"),
    connectedBy: integer("connected_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    metaAdsTokensTeamIdx: index("meta_ads_tokens_team_idx").on(table.teamId),
    metaAdsTokensLabelUnique: unique("meta_ads_tokens_team_label_uidx").on(table.teamId, table.label),
  }),
);

export const metaAdAccounts = pgTable(
  "meta_ad_accounts",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    tokenId: integer("token_id").notNull().references(() => metaAdsTokens.id, { onDelete: "cascade" }),
    accountId: varchar("account_id", { length: 40 }).notNull(),
    name: text("name").notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    timezoneName: varchar("timezone_name", { length: 64 }),
    accountStatus: integer("account_status"),
    businessId: varchar("business_id", { length: 40 }),
    businessName: text("business_name"),
    amountSpent: decimal("amount_spent", { precision: 16, scale: 2 }).notNull().default("0"),
    // Meta reporta inversión NETA. Esta alícuota (impuestos/percepciones) da el costo final.
    taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull().default("30.00"),
    // Cuenta oculta: sale del selector pero conserva su histórico.
    visible: boolean("visible").notNull().default(true),
    syncEnabled: boolean("sync_enabled").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at"),
    lastSyncStatus: varchar("last_sync_status", { length: 20 }), // ok | error | partial
    lastError: text("last_error"),
    campaignsCount: integer("campaigns_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    metaAdAccountsTeamIdx: index("meta_ad_accounts_team_idx").on(table.teamId),
    metaAdAccountsSyncIdx: index("meta_ad_accounts_sync_idx").on(table.syncEnabled, table.lastSyncedAt),
    metaAdAccountsUnique: unique("meta_ad_accounts_team_account_uidx").on(table.teamId, table.accountId),
  }),
);

export const metaCampaigns = pgTable(
  "meta_campaigns",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    adAccountId: integer("ad_account_id").notNull().references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    campaignId: varchar("campaign_id", { length: 40 }).notNull(),
    name: text("name").notNull(),
    status: varchar("status", { length: 20 }),
    effectiveStatus: varchar("effective_status", { length: 40 }),
    objective: varchar("objective", { length: 50 }),
    resultActionType: varchar("result_action_type", { length: 80 }),
    buyingType: varchar("buying_type", { length: 20 }),
    dailyBudget: decimal("daily_budget", { precision: 14, scale: 2 }),
    lifetimeBudget: decimal("lifetime_budget", { precision: 14, scale: 2 }),
    createdTime: timestamp("created_time"),
    startTime: timestamp("start_time"),
    stopTime: timestamp("stop_time"),
    updatedTime: timestamp("updated_time"),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    metaCampaignsTeamIdx: index("meta_campaigns_team_idx").on(table.teamId),
    metaCampaignsAccountStatusIdx: index("meta_campaigns_account_status_idx").on(table.adAccountId, table.status),
    metaCampaignsUnique: unique("meta_campaigns_account_campaign_uidx").on(table.adAccountId, table.campaignId),
  }),
);

export const metaCampaignInsightsDaily = pgTable(
  "meta_campaign_insights_daily",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    adAccountId: integer("ad_account_id").notNull().references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    campaignRowId: integer("campaign_row_id").notNull().references(() => metaCampaigns.id, { onDelete: "cascade" }),
    campaignId: varchar("campaign_id", { length: 40 }).notNull(),
    date: date("date").notNull(),
    // OJO: spend viene de Meta en moneda, no en centavos.
    spend: decimal("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    impressions: bigint("impressions", { mode: "number" }).notNull().default(0),
    // reach NO es sumable entre días (Meta lo deduplica). No usarlo para KPIs de rango.
    reach: bigint("reach", { mode: "number" }).notNull().default(0),
    clicks: bigint("clicks", { mode: "number" }).notNull().default(0),
    inlineLinkClicks: bigint("inline_link_clicks", { mode: "number" }).notNull().default(0),
    frequency: decimal("frequency", { precision: 8, scale: 4 }),
    results: decimal("results", { precision: 14, scale: 2 }).notNull().default("0"),
    resultActionType: varchar("result_action_type", { length: 80 }),
    actions: jsonb("actions").$type<Array<{ action_type: string; value: string }>>().notNull().default([]),
    costPerActionType: jsonb("cost_per_action_type")
      .$type<Array<{ action_type: string; value: string }>>()
      .notNull()
      .default([]),
    currency: varchar("currency", { length: 10 }),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
  },
  (table) => ({
    metaInsightsAccountDateIdx: index("meta_insights_account_date_idx").on(table.adAccountId, table.date),
    metaInsightsTeamDateIdx: index("meta_insights_team_date_idx").on(table.teamId, table.date),
    metaInsightsUnique: unique("meta_insights_campaign_date_uidx").on(table.campaignRowId, table.date),
  }),
);

export const metaAdsSyncRuns = pgTable(
  "meta_ads_sync_runs",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    adAccountId: integer("ad_account_id").notNull().references(() => metaAdAccounts.id, { onDelete: "cascade" }),
    trigger: varchar("trigger", { length: 10 }).notNull(), // manual | cron
    status: varchar("status", { length: 20 }).notNull(), // running | ok | error | partial
    since: date("since"),
    until: date("until"),
    campaignsUpserted: integer("campaigns_upserted").notNull().default(0),
    insightsUpserted: integer("insights_upserted").notNull().default(0),
    error: text("error"),
    startedBy: integer("started_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => ({
    metaAdsSyncRunsAccountIdx: index("meta_ads_sync_runs_account_idx").on(table.adAccountId, table.startedAt),
  }),
);

export const metaAdAccountsRelations = relations(metaAdAccounts, ({ one, many }) => ({
  token: one(metaAdsTokens, { fields: [metaAdAccounts.tokenId], references: [metaAdsTokens.id] }),
  campaigns: many(metaCampaigns),
}));

export const metaCampaignsRelations = relations(metaCampaigns, ({ one, many }) => ({
  account: one(metaAdAccounts, { fields: [metaCampaigns.adAccountId], references: [metaAdAccounts.id] }),
  insights: many(metaCampaignInsightsDaily),
}));

export const metaCampaignInsightsDailyRelations = relations(metaCampaignInsightsDaily, ({ one }) => ({
  campaign: one(metaCampaigns, {
    fields: [metaCampaignInsightsDaily.campaignRowId],
    references: [metaCampaigns.id],
  }),
}));

export type MetaAdsToken = typeof metaAdsTokens.$inferSelect;
export type NewMetaAdsToken = typeof metaAdsTokens.$inferInsert;
export type MetaAdAccount = typeof metaAdAccounts.$inferSelect;
export type NewMetaAdAccount = typeof metaAdAccounts.$inferInsert;
export type MetaCampaign = typeof metaCampaigns.$inferSelect;
export type NewMetaCampaign = typeof metaCampaigns.$inferInsert;
export type MetaCampaignInsight = typeof metaCampaignInsightsDaily.$inferSelect;
export type NewMetaCampaignInsight = typeof metaCampaignInsightsDaily.$inferInsert;
export type MetaAdsSyncRun = typeof metaAdsSyncRuns.$inferSelect;
export type NewMetaAdsSyncRun = typeof metaAdsSyncRuns.$inferInsert;

// ---------------------------------------------------------------------------
// App Documentos (editor tipo Notion)
// ---------------------------------------------------------------------------

export const teamDocumentFolders = pgTable(
  "team_document_folders",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    parentId: integer("parent_id"),
    name: varchar("name", { length: 120 }).notNull(),
    emoji: varchar("emoji", { length: 16 }),
    // 1 = raíz. El CHECK de la migración impide pasar de 5.
    depth: integer("depth").notNull().default(1),
    position: integer("position").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    parentFk: foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "team_document_folders_parent_id_fk",
    }).onDelete("cascade"),
    teamIdx: index("team_document_folders_team_idx").on(table.teamId),
    parentIdx: index("team_document_folders_parent_idx").on(table.parentId),
  }),
);

export const teamDocuments = pgTable(
  "team_documents",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    folderId: integer("folder_id").references(() => teamDocumentFolders.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull().default("Documento sin título"),
    slug: varchar("slug", { length: 220 }).notNull(),
    emoji: varchar("emoji", { length: 16 }),
    content: jsonb("content").$type<Record<string, unknown>>().notNull().default({ type: "doc", content: [] }),
    contentText: text("content_text").notNull().default(""),
    // 'markdown' (default, editor Tiptap sobre `content`) | 'html' (informe/archivo HTML
    // pegado tal cual, se guarda en `htmlContent` y se renderiza sandboxeado, no editable
    // con el editor Tiptap).
    format: varchar("format", { length: 20 }).notNull().default("markdown"),
    htmlContent: text("html_content"),
    // Concurrencia optimista: el guardado que llega con una versión vieja recibe 409.
    version: integer("version").notNull().default(1),
    position: integer("position").notNull().default(0),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamSlugUnique: unique("team_documents_team_slug_uidx").on(table.teamId, table.slug),
    teamIdx: index("team_documents_team_idx").on(table.teamId),
    folderIdx: index("team_documents_folder_idx").on(table.folderId),
    updatedIdx: index("team_documents_updated_idx").on(table.teamId, table.updatedAt),
  }),
);

export const teamDocumentLinks = pgTable(
  "team_document_links",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    sourceDocumentId: integer("source_document_id").notNull().references(() => teamDocuments.id, { onDelete: "cascade" }),
    targetDocumentId: integer("target_document_id").notNull().references(() => teamDocuments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    pairUnique: unique("team_document_links_pair_uidx").on(table.sourceDocumentId, table.targetDocumentId),
    targetIdx: index("team_document_links_target_idx").on(table.targetDocumentId),
  }),
);

export const teamDocumentMedia = pgTable(
  "team_document_media",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    documentId: integer("document_id").references(() => teamDocuments.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 180 }),
    sizeBytes: integer("size_bytes"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    documentIdx: index("team_document_media_document_idx").on(table.documentId),
  }),
);

// Per-user layout for the operations desktop. The JSON payload is versioned so
// widgets can evolve without destructive migrations.
export const teamDesktopPreferences = pgTable(
  "team_desktop_preferences",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    layout: jsonb("layout")
      .$type<{ version: 1; order: string[]; pinned: string[]; hidden: string[] }>()
      .notNull()
      .default({ version: 1, order: [], pinned: [], hidden: [] }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamUserUnique: unique("team_desktop_preferences_team_user_uidx").on(table.teamId, table.userId),
    userIdx: index("team_desktop_preferences_user_idx").on(table.userId),
  }),
);

export type TeamDocumentFolder = typeof teamDocumentFolders.$inferSelect;
export type NewTeamDocumentFolder = typeof teamDocumentFolders.$inferInsert;
export type TeamDocument = typeof teamDocuments.$inferSelect;
export type NewTeamDocument = typeof teamDocuments.$inferInsert;
export type TeamDocumentLink = typeof teamDocumentLinks.$inferSelect;
export type TeamDocumentMedia = typeof teamDocumentMedia.$inferSelect;
export type TeamDesktopPreference = typeof teamDesktopPreferences.$inferSelect;


export const resellersRelations = relations(resellers, ({ one, many }) => ({
  ownerUser: one(users, {
    fields: [resellers.ownerUserId],
    references: [users.id],
  }),
  domains: many(resellerDomains),
  planPrices: many(resellerPlanPrices),
  wallet: one(resellerWallets),
  branding: one(branding),
  teams: many(teams),
}));

export const resellerDomainsRelations = relations(resellerDomains, ({ one }) => ({
  reseller: one(resellers, {
    fields: [resellerDomains.resellerId],
    references: [resellers.id],
  }),
}));

export const resellerPlanPricesRelations = relations(
  resellerPlanPrices,
  ({ one }) => ({
    reseller: one(resellers, {
      fields: [resellerPlanPrices.resellerId],
      references: [resellers.id],
    }),
    plan: one(plans, {
      fields: [resellerPlanPrices.planId],
      references: [plans.id],
    }),
  }),
);

export const resellerWalletsRelations = relations(
  resellerWallets,
  ({ one, many }) => ({
    reseller: one(resellers, {
      fields: [resellerWallets.resellerId],
      references: [resellers.id],
    }),
    transactions: many(walletTransactions),
  }),
);

export const walletTransactionsRelations = relations(
  walletTransactions,
  ({ one }) => ({
    wallet: one(resellerWallets, {
      fields: [walletTransactions.walletId],
      references: [resellerWallets.id],
    }),
    reseller: one(resellers, {
      fields: [walletTransactions.resellerId],
      references: [resellers.id],
    }),
    team: one(teams, {
      fields: [walletTransactions.teamId],
      references: [teams.id],
    }),
  }),
);

export const resellerTopupsRelations = relations(resellerTopups, ({ one }) => ({
  reseller: one(resellers, {
    fields: [resellerTopups.resellerId],
    references: [resellers.id],
  }),
}));

export const brandingRelations = relations(branding, ({ one }) => ({
  reseller: one(resellers, {
    fields: [branding.resellerId],
    references: [resellers.id],
  }),
}));
