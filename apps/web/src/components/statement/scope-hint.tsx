import { EXAMPLE_QUESTION } from "@/lib/assistant";

/** spec §2.2: "Read-only · answers are drawn from this account's statement
 * below" + one example link. Also §2.2 A11y: "ScopeHint states read-only." */
export function ScopeHint({ onExample }: { onExample: (text: string) => void }) {
  return (
    <p className="text-secondary text-text-muted">
      Read-only · answers are drawn from this account&apos;s statement below.{" "}
      <button
        type="button"
        onClick={() => onExample(EXAMPLE_QUESTION)}
        className="text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent"
      >
        See an example
      </button>
    </p>
  );
}
