import {
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ASSISTANT_TOOLS,
  buildSystemPrompt,
  type OllamaToolDefinition,
} from './tools';
import {
  KEEP_ALIVE,
  MAX_OUTPUT_TOKENS,
  OLLAMA_BASE_URL,
  ASSISTANT_MODEL,
  REQUEST_TIMEOUT_MS,
} from './budget-gate';

/**
 * Ollama (https://ollama.com), not a hosted API — free, runs locally, no API
 * key, no billing account, no per-request cost. The same seam Atlas's
 * `OllamaSummaryClient` uses (`atlas/packages/api/src/app/ai-assistant/
 * ollama-summary-client.ts`) for the identical reason: the assistant module
 * is provider-agnostic everywhere except this one class — swapping providers
 * later means replacing this file, not redesigning the feature.
 *
 * Requires a local Ollama daemon running with the configured model already
 * pulled (`ollama pull <model>`) — documented, local-dev-only requirement.
 * Every failure mode (daemon not running, model not pulled, network error,
 * timeout) becomes a real `ServiceUnavailableException` — never a silently
 * swallowed console error or a fabricated answer.
 */

export interface OllamaToolCall {
  function: { name: string; arguments: unknown };
}

export interface OllamaChatResult {
  toolCalls: OllamaToolCall[];
  content: string | null;
  promptEvalCount: number;
  evalCount: number;
  totalDurationNs: number;
}

interface OllamaChatResponse {
  message?: { content?: string; tool_calls?: OllamaToolCall[] };
  prompt_eval_count?: number;
  eval_count?: number;
  total_duration?: number;
}

@Injectable()
export class OllamaAssistantClient implements OnModuleInit {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.baseUrl =
      config.get<string>('COGENT_OLLAMA_BASE_URL') ?? OLLAMA_BASE_URL;
    this.model = config.get<string>('COGENT_OLLAMA_MODEL') ?? ASSISTANT_MODEL;
  }

  /**
   * Amendment §3(b)/§6: one warm-up call at boot, so a real user's first
   * interactive query does not pay the measured cold-load cost. This is a
   * best-effort mitigation, not a startup gate — a failed warm-up degrades
   * to first-query cold-start latency, not a boot failure, since Ollama may
   * legitimately not be running yet in a fresh dev environment.
   *
   * MUST send the real `tools` + system prompt, not a bare text prompt — a
   * real end-to-end boot test (2026-07-24/25, before commit) found that a
   * bare "hi" warm-up (no tools) loads the model weights but does NOT warm
   * whatever Ollama does once per session to serve tool-constrained
   * decoding: with the bare-prompt warm-up in place, boot itself was fast
   * after the first run (+2.4s once the model was already resident), but
   * the FIRST real tool-calling request still separately timed out past
   * REQUEST_TIMEOUT_MS and returned a genuine 503 — the exact fail-safe
   * behavior working as designed, but proof the mitigation was incomplete.
   * Sending the actual tools/prompt shape here pays that separate cost once,
   * at boot, instead of on a real user's first query.
   */
  async onModuleInit(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: 'What did we spend last week?' },
          ],
          tools: ASSISTANT_TOOLS,
          stream: false,
          keep_alive: KEEP_ALIVE,
          options: { num_predict: MAX_OUTPUT_TOKENS },
        }),
        // Cold-load (model weights + tool-grammar compilation) can exceed
        // the steady-state timeout — this call exists specifically to
        // absorb that cost once, at boot, not to be bounded by the same
        // budget it's trying to avoid on the first real query.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 3),
      });
    } catch (err) {
      console.error(
        `[assistant] Ollama warm-up failed at boot (is "ollama serve" running at ${this.baseUrl}?):`,
        err,
      );
    }
  }

  async chat(
    systemPrompt: string,
    question: string,
    tools: OllamaToolDefinition[],
  ): Promise<OllamaChatResult> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question },
          ],
          tools,
          stream: false,
          keep_alive: KEEP_ALIVE,
          options: { num_predict: MAX_OUTPUT_TOKENS },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      console.error(
        `[assistant] Ollama request failed (is "ollama serve" running at ${this.baseUrl}?):`,
        err,
      );
      throw new ServiceUnavailableException(
        'Assistant is temporarily unavailable',
      );
    }

    if (!response.ok) {
      console.error(
        `[assistant] Ollama returned ${response.status} ${response.statusText} ` +
          `(is model "${this.model}" pulled? \`ollama pull ${this.model}\`)`,
      );
      throw new ServiceUnavailableException(
        'Assistant is temporarily unavailable',
      );
    }

    const body = (await response.json()) as OllamaChatResponse;
    return {
      toolCalls: body.message?.tool_calls ?? [],
      content: body.message?.content ?? null,
      promptEvalCount: body.prompt_eval_count ?? 0,
      evalCount: body.eval_count ?? 0,
      totalDurationNs: body.total_duration ?? 0,
    };
  }
}
