import { Module } from '@nestjs/common';
import { UsageController } from './usage.controller';

/**
 * `UsageEventsRepository` is provided by the (global) `DbModule` — this
 * module only adds the HTTP surface over it, same shape as `IngestModule`
 * over `IngestService`.
 */
@Module({
  controllers: [UsageController],
})
export class UsageModule {}
