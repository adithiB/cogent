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
import { AuthGuard } from '../auth/auth.guard';
import type { RequestWithScope } from '../auth/auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { askQuestionSchema, type AskQuestionDto } from './dto/ask.dto';
import { AssistantService } from './assistant.service';

/**
 * ADR-0004: the NL-query assistant surface. Not a nav destination (spec
 * §0/§2.3) — this is the one endpoint the AskBar and expanded thread both
 * call. `scope` comes from `AuthGuard`, identical to every other
 * authenticated read; the assistant gets no separate data-access path.
 */
@Controller('v1/assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @UseGuards(AuthGuard)
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async ask(
    @Body(new ZodValidationPipe(askQuestionSchema)) dto: AskQuestionDto,
    @Req() req: Request,
  ) {
    const { scope } = req as RequestWithScope;
    return this.assistant.ask(scope, dto.question);
  }
}
