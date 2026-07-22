import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyGuard } from '../auth/api-key.guard';
import type { RequestWithScope } from '../auth/auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ingestEventSchema, type IngestEventDto } from './dto/ingest-event.dto';
import { IngestService } from './ingest.service';

/**
 * ADR-0002 §2a: one endpoint, one synchronous write, no queue — argued and
 * scoped explicitly in the ADR, with the SQS-backed escalation designed
 * (§2d) but not built. `201` here means the event is durably *written*; the
 * escalation would change this to `202` (durably *queued*), a real contract
 * change, not a free optimization.
 */
@Controller('v1/events')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @UseGuards(ApiKeyGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(ingestEventSchema)) dto: IngestEventDto,
    @Req() req: Request,
  ) {
    const { scope } = req as RequestWithScope;
    await this.ingest.ingest(scope, dto);
    return { received: true };
  }
}
