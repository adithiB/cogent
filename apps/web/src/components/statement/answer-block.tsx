import { Badge } from "@/components/ui/badge";
import { formatMappedTag, formatUsage } from "@/lib/assistant";
import type { MappedTo } from "@/lib/api-client";

/**
 * spec §2.3: every answer carries a `mapped:` tag (the actually-dispatched
 * function/args, real — ADR-0004) and a compute-budget tag. ADR-0004's
 * 2026-07-23/24 amendment §5 is explicit that this tag must not show a
 * dollar figure — Ollama is local and has no per-token cost — so this shows
 * real measured tokens + wall-time from Ollama's response, never `$`.
 */
export function AnswerBlock({
  mapped,
  answerText,
  usage,
  unscoped,
}: {
  mapped: MappedTo;
  answerText: string;
  usage: { promptTokens: number; completionTokens: number; durationMs: number };
  /** spec §1.8 says `slice` always re-scopes the statement — true for
   * project/team/model, but the Statement's GroupingPill has no `time`
   * option, so a time-grouped slice can't. Says so plainly rather than
   * silently leaving the table showing unrelated state next to this
   * answer. */
  unscoped?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-body text-text">{answerText}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="accent">mapped: {formatMappedTag(mapped)}</Badge>
        <Badge variant="neutral">{formatUsage(usage)}</Badge>
      </div>
      {unscoped && (
        <p className="mt-2 text-secondary text-text-faint">
          This breakdown is grouped by time, which the statement below can&apos;t display — the table
          isn&apos;t re-scoped to this answer.
        </p>
      )}
    </div>
  );
}
