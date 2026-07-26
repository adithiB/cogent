"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { AnswerLog } from "./answer-log";
import { AskBar } from "./ask-bar";
import { GroupingPill } from "./grouping-pill";
import { MeasureSegmented } from "./measure-segmented";
import { PeriodPill } from "./period-pill";
import { ScopeHint } from "./scope-hint";
import { StatementCaption } from "./statement-caption";
import { StatementEmptyState } from "./statement-empty-state";
import { StatementErrorState } from "./statement-error-state";
import { StatementHeader } from "./statement-header";
import { StatementSkeleton } from "./statement-skeleton";
import { StatementTable } from "./statement-table";
import { ViewingFilterChip } from "./viewing-filter-chip";
import { MAX_ANSWER_LOG_ENTRIES, type AnswerLogEntry } from "@/lib/assistant";
import { askAssistant, type Dimension, type GroupingDimension, type Metric, type MetricFilter } from "@/lib/api-client";
import { useStatement } from "@/lib/hooks/use-statement";
import { useSpendTrend } from "@/lib/hooks/use-spend-trend";
import { useSession } from "@/lib/hooks/use-session";
import { useBudgetAlertsWithStatus } from "@/lib/hooks/use-budget-alerts";
import { DEFAULT_PERIOD, PERIOD_OPTIONS, periodToWindow, type PeriodId } from "@/lib/period";

/**
 * cogent-ui-implementation-spec.md §2.2 — the Statement screen. AskBar's
 * dispatch is real as of this session: `askAssistant` posts to the real
 * `/v1/assistant/ask` (ADR-0004), and `submitQuestion` routes on whatever
 * envelope the backend actually returns.
 */
export function StatementScreen() {
  const queryClient = useQueryClient();
  const session = useSession();

  const [measure, setMeasure] = useState<Metric>("spend");
  const [grouping, setGrouping] = useState<GroupingDimension>("project");
  const [period, setPeriod] = useState<PeriodId>(DEFAULT_PERIOD);
  const [viewingFilter, setViewingFilter] = useState<MetricFilter | undefined>(undefined);

  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [answerLog, setAnswerLog] = useState<AnswerLogEntry[]>([]);

  const window = periodToWindow(period);
  const periodLabel = PERIOD_OPTIONS.find((p) => p.id === period)?.label ?? period;

  const statement = useStatement({ window, groupBy: grouping, filter: viewingFilter });
  const trend = useSpendTrend(window);
  const budgetAlerts = useBudgetAlertsWithStatus();

  // BudgetRule §1.7: the alert matching whatever scope is currently being
  // viewed — org total by default, or the active re-scope filter.
  const viewBudgetAlert = budgetAlerts.data?.find((a) =>
    viewingFilter
      ? a.scope.dimension === viewingFilter.dimension && a.scope.value === viewingFilter.value
      : a.scope.dimension === "total",
  );

  function pushAnswer(entry: AnswerLogEntry) {
    setAnswerLog((log) => [entry, ...log].slice(0, MAX_ANSWER_LOG_ENTRIES));
  }

  function applyExample(text: string) {
    setQuestion(text);
  }

  function isGroupingDimension(d: Dimension): d is GroupingDimension {
    return d !== "time";
  }

  /**
   * ADR-0004 amendment §3e: the client's live token estimate (AskBar) is
   * legibility only, never a submit gate — always POST and let the server's
   * real admission gate decide `budget_exceeded`, so that state is never
   * fabricated client-side.
   */
  async function submitQuestion(q: string) {
    const id = crypto.randomUUID();
    setSubmitting(true);
    try {
      const envelope = await askAssistant(q);

      // spec §1.8: `slice` re-scopes the statement to the mapped grouping +
      // filter; `point` leaves it unchanged (the AnswerBlock alone answers).
      // ADR-0004 Finding 1's `filter` fix on `getStatement` is what makes a
      // *filtered* slice re-scope correctly, not just an unfiltered one.
      if (envelope.type === "answer" && envelope.result.intent === "slice") {
        const groupBy = envelope.result.groupBy;
        if (isGroupingDimension(groupBy)) {
          setGrouping(groupBy);
          setViewingFilter(envelope.mapped.args.filter);
          pushAnswer({ id, question: q, ...envelope });
        } else {
          // groupBy 'time' — the Statement's GroupingPill has no time
          // option (spec §2.2's allow-list is project/team/model only), so
          // there is no table to re-scope into. Leaving grouping/filter
          // state untouched here would silently strand whatever the table
          // already showed (including a stale filter from an earlier,
          // unrelated query) next to an AnswerBlock about something else
          // entirely — `unscoped` makes AnswerBlock say so explicitly
          // instead of implying a correspondence that isn't there.
          pushAnswer({ id, question: q, ...envelope, unscoped: true });
        }
      } else {
        pushAnswer({ id, question: q, ...envelope });
      }
    } catch (err) {
      console.error("[assistant] ask failed:", err);
      pushAnswer({
        id,
        question: q,
        type: "out_of_scope",
        reason: "Couldn't reach the query service. Try again.",
        rephraseChips: [
          "What did we spend this month?",
          "Show error rate by model",
          "Which team has the highest spend?",
        ],
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    const q = question.trim();
    setQuestion("");
    await submitQuestion(q);
  }

  function clearFilter() {
    setViewingFilter(undefined);
    void queryClient.invalidateQueries({ queryKey: ["statement"] });
  }

  const orgName = session.data?.org.name ?? "";
  const isEmpty = !viewingFilter && statement.data && statement.data.totals.requests === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <AskBar question={question} onQuestionChange={setQuestion} onSubmit={handleSubmit} submitting={submitting} />
        <ScopeHint onExample={applyExample} />
        <AnswerLog entries={answerLog} thinking={submitting} onRephrase={applyExample} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MeasureSegmented value={measure} onChange={setMeasure} />
        <GroupingPill value={grouping} onChange={setGrouping} />
        <PeriodPill value={period} onChange={setPeriod} />
        {viewingFilter && <ViewingFilterChip filter={viewingFilter} onDismiss={clearFilter} />}
      </div>

      <StatementCaption orgName={orgName} periodLabel={periodLabel} />

      {statement.isPending ? (
        <StatementSkeleton />
      ) : statement.isError ? (
        <StatementErrorState onRetry={() => statement.refetch()} />
      ) : isEmpty ? (
        <StatementEmptyState />
      ) : (
        <>
          <StatementHeader
            measure={measure}
            totals={statement.data.totals}
            trend={trend.data}
            budgetAlert={viewBudgetAlert}
          />
          <StatementTable
            rows={statement.data.rows}
            totals={statement.data.totals}
            measure={measure}
            grouping={grouping}
            alerts={budgetAlerts.data ?? []}
          />
        </>
      )}
    </div>
  );
}
