import { AnswerBlock } from "./answer-block";
import { CostCapCard } from "./cost-cap-card";
import { OutOfScopeCard } from "./out-of-scope-card";
import type { AnswerLogEntry } from "@/lib/assistant-stub";

/**
 * spec §2.2/§2.3: ≤4 entries, newest on top, `aria-live="polite"` so a new
 * answer is announced without moving focus. Container is real and always
 * mounted; only the entry content is stub data (§3).
 */
export function AnswerLog({
  entries,
  onRephrase,
}: {
  entries: AnswerLogEntry[];
  onRephrase: (text: string) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div aria-live="polite" className="space-y-2">
      {entries.map((entry) => {
        switch (entry.type) {
          case "answer":
            return (
              <AnswerBlock
                key={entry.id}
                mapped={entry.mapped}
                answerText={entry.answerText}
                estimatedTokens={entry.estimatedTokens}
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
                estimatedTokens={entry.estimatedTokens}
                maxTokens={entry.maxTokens}
              />
            );
        }
      })}
    </div>
  );
}
