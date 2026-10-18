// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const orders = sqliteTable('orders', {
  sessionHash: text('session_hash').primaryKey(),
  paymentIntent: text('payment_intent').notNull().unique(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull(),
  paidAt: integer('paid_at').notNull(),
  livemode: integer('livemode').notNull(),
});
export const refunds = sqliteTable('refunds', {
  paymentIntent: text('payment_intent').primaryKey(),
  amountCents: integer('amount_cents').notNull(),
});
export const receipts = sqliteTable('receipts', {
  eventId: text('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  receivedAt: integer('received_at').notNull(),
});
