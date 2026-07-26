import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { DRIZZLE, type Database } from './drizzle.token';
import { OrgsRepository } from './repositories/orgs.repository';
import { UsersRepository } from './repositories/users.repository';
import { MembershipsRepository } from './repositories/memberships.repository';
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';
import { ApiKeysRepository } from './repositories/api-keys.repository';
import { UsageEventsRepository } from './repositories/usage-events.repository';
import { BudgetAlertsRepository } from './repositories/budget-alerts.repository';

const repositories = [
  OrgsRepository,
  UsersRepository,
  MembershipsRepository,
  RefreshTokensRepository,
  ApiKeysRepository,
  UsageEventsRepository,
  BudgetAlertsRepository,
];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Database => {
        const pool = new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
        });
        return drizzle(pool, { schema });
      },
    },
    ...repositories,
  ],
  exports: [DRIZZLE, ...repositories],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Closes the underlying pg Pool on app shutdown — otherwise the process
   * (and every e2e test run) hangs on an open handle. */
  async onModuleDestroy() {
    await this.db.$client.end();
  }
}
