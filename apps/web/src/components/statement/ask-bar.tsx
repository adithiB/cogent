"use client";

import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { estimateTokens, MAX_QUESTION_TOKENS } from "@/lib/assistant-stub";
import { cn } from "@/lib/utils";

/**
 * spec §2.2/§2.3: input + live compute-budget estimate + send. The estimate
 * is client-side UX only (ADR-0004 §3e's framing, transposed from dollars
 * to tokens by the amendment) — hidden below 400px per the responsive rule.
 * No ExpandToggle here: the expanded Sheet is spec §2.3, a later session.
 */
export function AskBar({
  question,
  onQuestionChange,
  onSubmit,
  submitting,
}: {
  question: string;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const estimated = estimateTokens(question);
  const overBudget = estimated > MAX_QUESTION_TOKENS;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (question.trim() && !submitting) onSubmit();
      }}
      className="flex items-center gap-2"
    >
      <Input
        value={question}
        onChange={(e) => onQuestionChange(e.target.value)}
        placeholder="Ask about your usage…"
        aria-label="Ask about your usage"
        className="flex-1"
      />
      <span
        className={cn(
          "hidden min-[400px]:inline shrink-0 font-mono text-secondary whitespace-nowrap",
          overBudget ? "text-danger-ink" : "text-text-faint",
        )}
      >
        ~{estimated} tok
      </span>
      <Button type="submit" size="icon" disabled={!question.trim() || submitting} aria-label="Send question">
        {submitting ? (
          <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Send size={16} aria-hidden="true" />
        )}
      </Button>
    </form>
  );
}
