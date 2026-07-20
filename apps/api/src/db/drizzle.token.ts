import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type * as schema from './schema';

/**
 * Split from `db.module.ts` on purpose: that file imports the repository
 * classes to register them as providers, and every repository imports this
 * token — declaring both in `db.module.ts` created a circular import where
 * `DRIZZLE` was still `undefined` at the point the repositories read it.
 */
export const DRIZZLE = Symbol('DRIZZLE');
export type Database = NodePgDatabase<typeof schema> & { $client: Pool };
