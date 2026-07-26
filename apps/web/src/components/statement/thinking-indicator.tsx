/**
 * spec §2.3 "thinking" state: real Ollama inference is several seconds
 * (warm) to over a minute (cold-load, ADR-0004 amendment §3b) — this has to
 * read as "genuinely working," not a frozen or snappy-but-slow UI.
 * "inline dots; reduced-motion → 'Working…'" per spec, via `motion-safe`/
 * `motion-reduce` (same convention as `Skeleton` and the AskBar spinner).
 */
export function ThinkingIndicator() {
  return (
    <div role="status" className="flex items-center gap-1.5 px-1 text-secondary text-text-muted">
      <span className="motion-reduce:hidden">
        Thinking
        <span aria-hidden="true" className="ml-1 inline-flex gap-0.5 align-middle">
          <span className="h-1 w-1 rounded-full bg-current motion-safe:animate-bounce [animation-delay:-0.3s]" />
          <span className="h-1 w-1 rounded-full bg-current motion-safe:animate-bounce [animation-delay:-0.15s]" />
          <span className="h-1 w-1 rounded-full bg-current motion-safe:animate-bounce" />
        </span>
      </span>
      <span className="hidden motion-reduce:inline">Working…</span>
    </div>
  );
}
