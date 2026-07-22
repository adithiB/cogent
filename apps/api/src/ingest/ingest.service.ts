import { ConflictException, Injectable } from '@nestjs/common';
import { UsageEventsRepository } from '../db/repositories/usage-events.repository';
import type { TenantScope } from '../db/scope';
import type { IngestEventDto } from './dto/ingest-event.dto';

/**
 * drizzle-orm's node-postgres driver wraps the raw `pg` `DatabaseError` in
 * its own error, whose own properties are `query`/`params`/`cause` — the
 * real `code`/`constraint` fields live one level down, on `.cause`, not on
 * the thrown error itself (mirrors the identical fix in auth.service.ts).
 */
function isUniqueViolation(err: unknown, constraint: string): boolean {
  const pg = (err as { cause?: unknown })?.cause ?? err;
  return (
    typeof pg === 'object' &&
    pg !== null &&
    (pg as { code?: string }).code === '23505' &&
    (pg as { constraint?: string }).constraint === constraint
  );
}

@Injectable()
export class IngestService {
  constructor(private readonly usageEvents: UsageEventsRepository) {}

  /**
   * ADR-0002 §2a/§2b: the single synchronous write path — no queue. `scope`,
   * produced only by `ApiKeyGuard` from a verified credential, is the sole
   * source of `org_id`; `dto` has no field that could redirect the write.
   */
  async ingest(scope: TenantScope, dto: IngestEventDto): Promise<void> {
    try {
      await this.usageEvents.insertEvent(scope, dto);
    } catch (err) {
      if (isUniqueViolation(err, 'usage_events_org_external_unique')) {
        throw new ConflictException(
          'An event with this externalId has already been recorded.',
        );
      }
      throw err;
    }
  }
}
