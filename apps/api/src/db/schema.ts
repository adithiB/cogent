import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['owner', 'member']);

/**
 * One row per tenant. Uniqueness lives on `slug`, not `name` — ADR-0001 §Decision-4:
 * "Acme Robotics" / "acme robotics" / "Acme  Robotics!" must collide, because that's
 * what a human means by "that name is taken."
 */
export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('orgs_slug_unique').on(table.slug),
]);

/**
 * Identity only. Email is globally unique — one identity, many memberships.
 * Role and org do NOT live here (see `memberships`): ADR-0001 §Decision-4 corrects
 * the spec's implied `users.org_id` model because it would make the locked
 * OrgSwitcher (cogent-ui-implementation-spec.md §1.6) unreachable.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_email_unique').on(table.email),
]);

/**
 * The join table that makes org-scoping and role a property of a (user, org) pair,
 * not of a user. The JWT's `org`/`role` claims are a cache of this row, re-derived
 * on every refresh (ADR-0001 §1c) rather than copied forward.
 */
export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('memberships_user_org_unique').on(table.userId, table.orgId),
]);

/**
 * Opaque refresh tokens (ADR-0001 §1c) — never a JWT. Only the SHA-256 hash of the
 * token is stored. `familyId` groups a rotation chain; reuse of a `revokedAt` row
 * revokes the whole family. `orgId`/`role` are snapshotted at issuance for audit
 * purposes only — the live values are re-read from `memberships` on every refresh.
 */
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull(),
  familyId: uuid('family_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedBy: uuid('replaced_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('refresh_tokens_hash_unique').on(table.tokenHash),
]);
