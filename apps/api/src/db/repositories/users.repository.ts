import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../drizzle.token';
import { users } from '../schema';

@Injectable()
export class UsersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Unscoped by necessity: identity is looked up by email during login,
   * before any org membership — and therefore any `TenantScope` — is known.
   */
  findByEmail(email: string) {
    return this.db.query.users.findFirst({ where: eq(users.email, email) });
  }

  findById(id: string) {
    return this.db.query.users.findFirst({ where: eq(users.id, id) });
  }
}
