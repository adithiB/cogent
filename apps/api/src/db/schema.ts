import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  integer,
  bigint,
  boolean,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['owner', 'member']);

/**
 * One row per tenant. Uniqueness lives on `slug`, not `name` — ADR-0001 §Decision-4:
 * "Acme Robotics" / "acme robotics" / "Acme  Robotics!" must collide, because that's
 * what a human means by "that name is taken."
 */
export const orgs = pgTable(
  'orgs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('orgs_slug_unique').on(table.slug)],
);

/**
 * Identity only. Email is globally unique — one identity, many memberships.
 * Role and org do NOT live here (see `memberships`): ADR-0001 §Decision-4 corrects
 * the spec's implied `users.org_id` model because it would make the locked
 * OrgSwitcher (cogent-ui-implementation-spec.md §1.6) unreachable.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);

/**
 * The join table that makes org-scoping and role a property of a (user, org) pair,
 * not of a user. The JWT's `org`/`role` claims are a cache of this row, re-derived
 * on every refresh (ADR-0001 §1c) rather than copied forward.
 */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('memberships_user_org_unique').on(table.userId, table.orgId),
  ],
);

/**
 * Opaque refresh tokens (ADR-0001 §1c) — never a JWT. Only the SHA-256 hash of the
 * token is stored. `familyId` groups a rotation chain; reuse of a `revokedAt` row
 * revokes the whole family. `orgId`/`role` are snapshotted at issuance for audit
 * purposes only — the live values are re-read from `memberships` on every refresh.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    familyId: uuid('family_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedBy: uuid('replaced_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('refresh_tokens_hash_unique').on(table.tokenHash)],
);

/**
 * One row per LLM API call (ADR-0002 §1d). `orgId` is the sole tenant-scope
 * column — every read composes its predicate via `orgScope(usageEvents.orgId,
 * scope)` (scoped-query.ts), never from a client-supplied id. `costMicros` is
 * integer micro-dollars, not float: LLM costs are sub-cent and `SUM` must be
 * exact on a product whose entire claim is an accurate bill.
 */
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** Client idempotency key. Unused by the synchronous MVP path except to
     * reject duplicate POSTs — present now so the queue escalation (ADR-0002
     * §2d, at-least-once delivery) needs no migration when it lands. */
    externalId: text('external_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    project: text('project').notNull(),
    team: text('team').notNull(),
    model: text('model').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    isError: boolean('is_error').notNull(),
    costMicros: bigint('cost_micros', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('usage_events_org_external_unique').on(
      table.orgId,
      table.externalId,
    ),
    index('usage_events_org_occurred_idx').on(table.orgId, table.occurredAt),
  ],
);

/**
 * Per-org bearer credential for machine-to-machine ingestion (ADR-0002 §2c).
 * Opaque, SHA-256-hashed at rest — same discipline as `refreshTokens` and for
 * the same reason: a 256-bit CSPRNG secret has no dictionary to slow-hash
 * against. Minted once, atomically, inside the signup transaction.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('api_keys_token_hash_unique').on(table.tokenHash)],
);
