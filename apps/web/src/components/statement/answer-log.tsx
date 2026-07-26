import { AnswerBlock } from "./answer-block";
import { CostCapCard } from "./cost-cap-card";
import { OutOfScopeCard } from "./out-of-scope-card";
import { ThinkingIndicator } from "./thinking-indicator";
import type { AnswerLogEntry } from "@/lib/assistant";

/**
 * spec §2.2/§2.3: ≤4 entries, newest on top, `aria-live="polite"` so a new
 * answer is announced without moving focus. Entries are the real backend
 * envelope now (ADR-0004) — `thinking` renders the in-flight state while a
 * real, multi-second Ollama call is outstanding.
 */
export function AnswerLog({
  entries,
  thinking,
  onRephrase,
}: {
  entries: AnswerLogEntry[];
  thinking: boolean;
  onRephrase: (text: string) => void;
}) {
  if (entries.length === 0 && !thinking) return null;

  return (
    <div aria-live="polite" className="space-y-2">
      {thinking && <ThinkingIndicator />}
      {entries.map((entry) => {
        switch (entry.type) {
          case "answer":
            return (
              <AnswerBlock
                key={entry.id}
                mapped={entry.mapped}
                answerText={entry.answerText}
                usage={entry.usage}
                unscoped={entry.unscoped}
              />
            );
          case "out_of_scope":
            return (
              <OutOfScopeCard
                key={entry.id}
                reason={entry.reason}
                rephraseChips={entry.rephraseChips}
                onRephrase={onRephrase}
              />
            );
          case "budget_exceeded":
            return (
              <CostCapCard
                key={entry.id}
                estimatedQuestionTokens={entry.estimatedQuestionTokens}
                maxQuestionTokens={entry.maxQuestionTokens}
              />
            );
        }
      })}
    </div>
  );
}
