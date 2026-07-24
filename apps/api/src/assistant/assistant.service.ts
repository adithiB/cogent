import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsageEventsRepository } from '../db/repositories/usage-events.repository';
import type { TenantScope } from '../db/scope';
import { metricArgsSchema } from '../usage/dto/metric-args.dto';
import type { MetricArgs, MetricResult } from '../usage/types';
import {
  checkAdmission,
  computeActualUsage,
  MAX_QUESTION_TOKENS,
} from './budget-gate';
import {
  ASSISTANT_TOOLS,
  buildSystemPrompt,
  OUT_OF_SCOPE_TOOL_NAME,
} from './tools';
import type { MetricToolName } from './tools';
import { outOfScopeArgsSchema } from './dto/out-of-scope.dto';
import { capRows, renderAnswerText } from './answer-template';
import { coerceStringifiedArgs } from './coerce-args';
import { OllamaAssistantClient } from './ollama-client';
import type { AssistantAnswerEnvelope } from './types';

const DEFAULT_REPHRASE_CHIPS = [
  'What did we spend last week?',
  'Show requests by project this month.',
  'What is our error rate today?',
];

/**
 * ADR-0004 §Decision-1: the hardcoded five-name dispatch map — the point
 * where "the allow-list is the function list" becomes literally true in
 * code. `scope` is the caller's `TenantScope` (never anything on `input`);
 * every function here is one of the five ADR-0002 §Decision-3 signatures,
 * unchanged.
 */
type MetricDispatch = (
  scope: TenantScope,
  args: MetricArgs,
) => Promise<MetricResult>;

@Injectable()
export class AssistantService {
  private readonly dispatch: Record<MetricToolName, MetricDispatch>;
  private readonly maxQuestionTokens: number;

  constructor(
    private readonly ollama: OllamaAssistantClient,
    private readonly config: ConfigService,
    private readonly usageEvents: UsageEventsRepository,
  ) {
    this.dispatch = {
      getSpend: (scope, args) => this.usageEvents.getSpend(scope, args),
      getRequestVolume: (scope, args) =>
        this.usageEvents.getRequestVolume(scope, args),
      getLatency: (scope, args) => this.usageEvents.getLatency(scope, args),
      getErrorRate: (scope, args) => this.usageEvents.getErrorRate(scope, args),
    };
    // Overridable only to manufacture the budget-exceeded state for
    // verification (amendment §3a) — never read from anything client-supplied.
    //
    // A real end-to-end boot of this service (2026-07-24, before commit)
    // caught a genuine bug here: `.env`'s ASSISTANT_MAX_QUESTION_TOKENS=
    // (present, but empty) is a defined string, not `undefined` — `??`
    // only falls back on null/undefined, so `Number('')` evaluated to `0`
    // and blocked every real query as budget_exceeded. `??` alone is not
    // enough; an explicitly blank override must be treated as absent too.
    const override = this.config.get<string>('ASSISTANT_MAX_QUESTION_TOKENS');
    this.maxQuestionTokens =
      override !== undefined && override.trim() !== ''
        ? Number(override)
        : MAX_QUESTION_TOKENS;
  }

  /**
   * ADR-0004 §Decision-3, re-derived by the 2026-07-23/24 amendment: the
   * pre-compute admission gate runs BEFORE the model is called — a question
   * that would exceed the token budget never reaches Ollama, so
   * `budget_exceeded` here means zero compute spent, not spent-then-refused.
   */
  async ask(
    scope: TenantScope,
    question: string,
  ): Promise<AssistantAnswerEnvelope> {
    const admission = checkAdmission(question, this.maxQuestionTokens);
    if (!admission.withinBudget) {
      return {
        type: 'budget_exceeded',
        estimatedQuestionTokens: admission.estimatedQuestionTokens,
        maxQuestionTokens: admission.maxQuestionTokens,
      };
    }

    const response = await this.ollama.chat(
      buildSystemPrompt(),
      question,
      ASSISTANT_TOOLS,
    );

    // Ollama's native /api/chat does not guarantee a tool call over prose
    // (amendment §2) — unlike the pre-amendment `tool_choice: 'any'` design,
    // this branch is a REACHABLE, expected outcome for a local model, not a
    // provider anomaly. Measured 24/24 on tool selection, but "no tool call
    // at all" did occur once in the reliability pass (§2), so it is handled
    // the same way an out-of-scope call is.
    const toolCall = response.toolCalls[0];
    if (!toolCall) {
      return this.outOfScope(
        'Could not map this question to a supported metric.',
      );
    }

    const fn = toolCall.function.name;
    // Amendment §2/§6: the model reliably computes correct arguments but
    // sometimes hands nested objects back serialized as a string — repaired
    // here, before either schema sees the arguments, so a genuinely
    // malformed call still falls through exactly as before.
    const rawArgs = coerceStringifiedArgs(toolCall.function.arguments);

    if (fn === OUT_OF_SCOPE_TOOL_NAME) {
      const parsed = outOfScopeArgsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return this.outOfScope(
          'Could not map this question to a supported metric.',
        );
      }
      return this.outOfScope(
        parsed.data.reason,
        parsed.data.suggestedRephrasings,
      );
    }

    const dispatchFn = this.dispatch[fn as MetricToolName];
    if (!dispatchFn) {
      // The model named something outside the fixed five-name map — no
      // forced tool choice locally means this is a real, if rare, path
      // (amendment §2), not the "structurally unreachable" case it was
      // under the hosted design. The dispatch stays closed either way: an
      // unknown name is out-of-scope, never a fallthrough to a data call.
      return this.outOfScope(
        'Could not map this question to a supported metric.',
      );
    }

    const parsedArgs = metricArgsSchema.safeParse(rawArgs);
    if (!parsedArgs.success) {
      return this.outOfScope(
        'The mapped query was missing required scope (a time window).',
      );
    }

    const result = capRows(await dispatchFn(scope, parsedArgs.data));
    const usage = computeActualUsage({
      prompt_eval_count: response.promptEvalCount,
      eval_count: response.evalCount,
      total_duration: response.totalDurationNs,
    });

    return {
      type: 'answer',
      result,
      mapped: { function: fn as MetricToolName, args: parsedArgs.data },
      answerText: renderAnswerText(parsedArgs.data, result),
      usage,
    };
  }

  private outOfScope(
    reason: string,
    rephraseChips: string[] = DEFAULT_REPHRASE_CHIPS,
  ): AssistantAnswerEnvelope {
    return {
      type: 'out_of_scope',
      reason,
      rephraseChips: rephraseChips.slice(0, 3),
    };
  }
}
