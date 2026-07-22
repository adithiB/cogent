import { ConflictException, Injectable } from '@nestjs/common';
import { UsageEventsRepository } from '../db/repositories/usage-events.repository';
import type { TenantScope } from '../db/scope';
import type { IngestEventDto } from './dto/ingest-event.dto';

function isUniqueViolation(err: unknown, constraint: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505' &&
    (err as { constraint?: string }).constraint === constraint
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
