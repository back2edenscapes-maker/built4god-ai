// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

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
export const contacts=sqliteTable('customer_contacts',{orderHash:text('order_hash').primaryKey(),emailHash:text('email_hash').notNull(),emailCipher:text('email_cipher').notNull()},table=>[index('contacts_email_idx').on(table.emailHash)]);
export const tokens=sqliteTable('access_tokens',{tokenHash:text('token_hash').primaryKey(),orderHash:text('order_hash').notNull(),expiresAt:integer('expires_at').notNull()});
export const outbox=sqliteTable('email_outbox',{id:text('id').primaryKey(),orderHash:text('order_hash').notNull(),payload:text('payload').notNull(),createdAt:integer('created_at').notNull(),nextAttempt:integer('next_attempt').notNull(),leaseUntil:integer('lease_until').notNull(),attempts:integer('attempts').notNull(),status:text('status').notNull(),sentAt:integer('sent_at')});
export const limits=sqliteTable('request_limits',{id:text('id').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()});
export const traffic=sqliteTable('traffic_daily',{day:text('day').notNull(),event:text('event').notNull(),source:text('source').notNull(),count:integer('count').notNull()},table=>[primaryKey({columns:[table.day,table.event,table.source]})]);
export const state=sqliteTable('app_state',{key:text('key').primaryKey(),value:text('value').notNull()});
export const orderSources=sqliteTable('order_sources',{orderHash:text('order_hash').primaryKey(),source:text('source').notNull()});
export const recoveryCodes=sqliteTable('recovery_codes',{codeHash:text('code_hash').primaryKey(),orderHash:text('order_hash').notNull().unique(),createdAt:integer('created_at').notNull()});
