import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const partnersTable = pgTable("ev_partners", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const activitiesTable = pgTable("ev_activities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type", {
    enum: [
      "event",
      "class",
      "workshop",
      "rehearsal",
      "meeting",
      "maintenance",
      "other",
    ],
  }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  responsible: text("responsible"),
  status: text("status", {
    enum: ["scheduled", "completed", "cancelled"],
  })
    .notNull()
    .default("scheduled"),
  description: text("description"),
  notes: text("notes"),
  pendingTasks: jsonb("pending_tasks")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  recurrenceGroup: text("recurrence_group"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const categoriesTable = pgTable("ev_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  appliesTo: text("applies_to", {
    enum: ["income", "expense", "both"],
  }).notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export const movementsTable = pgTable("ev_movements", {
  id: serial("id").primaryKey(),
  type: text("type", {
    enum: [
      "income",
      "expense",
      "partner_contribution",
      "partner_expense",
      "reimbursement",
    ],
  }).notNull(),
  date: date("date", { mode: "string" }).notNull(),
  concept: text("concept").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" })
    .notNull(),
  categoryId: integer("category_id").references(() => categoriesTable.id, {
    onDelete: "set null",
  }),
  activityId: integer("activity_id").references(() => activitiesTable.id, {
    onDelete: "set null",
  }),
  partnerId: integer("partner_id").references(() => partnersTable.id, {
    onDelete: "set null",
  }),
  receiptPath: text("receipt_path"),
  notes: text("notes"),
  status: text("status", { enum: ["active", "voided"] })
    .notNull()
    .default("active"),
  voidReason: text("void_reason"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const auditLogsTable = pgTable("ev_audit_logs", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  action: text("action", {
    enum: ["created", "updated", "voided", "cancelled"],
  }).notNull(),
  beforeData: jsonb("before_data").$type<Record<string, unknown> | null>(),
  afterData: jsonb("after_data").$type<Record<string, unknown>>(),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Partner = typeof partnersTable.$inferSelect;
export type NewPartner = typeof partnersTable.$inferInsert;
export type Activity = typeof activitiesTable.$inferSelect;
export type NewActivity = typeof activitiesTable.$inferInsert;
export type Category = typeof categoriesTable.$inferSelect;
export type NewCategory = typeof categoriesTable.$inferInsert;
export type Movement = typeof movementsTable.$inferSelect;
export type NewMovement = typeof movementsTable.$inferInsert;
