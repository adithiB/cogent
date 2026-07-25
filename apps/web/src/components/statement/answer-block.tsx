import { Badge } from "@/components/ui/badge";

/**
 * spec §2.3: every answer carries a `mapped:` tag (the actually-dispatched
 * function/args — real, see assistant-stub.ts) and a compute-budget tag.
 * ADR-0004's 2026-07-23/24 amendment §5 is explicit that this tag must not
 * show a dollar figure — Ollama is local and has no per-token cost, and a
 * `$` sign here would imply real spend that isn't happening. Because this
 * stub never makes a real model call, there is no real `usage` block to
 * report (durationMs would be fabricated) — so this shows only the token
 * estimate, honestly labeled as an estimate, not a measured figure.
 */
export function AnswerBlock({
  mapped,
  answerText,
  estimatedTokens,
}: {
  mapped: string;
  answerText: string;
  estimatedTokens: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-body text-text">{answerText}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="accent">mapped: {mapped}</Badge>
        <Badge variant="neutral">~{estimatedTokens} tok (est.)</Badge>
      </div>
    </div>
  );
}
