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
import {
  MAX_ANSWER_LOG_ENTRIES,
  MAX_QUESTION_TOKENS,
  OUT_OF_SCOPE_REASON,
  REPHRASE_CHIPS,
  classifyQuestion,
  estimateTokens,
  type AnswerLogEntry,
} from "@/lib/assistant-stub";
import { getSpendMetric, type GroupingDimension, type Metric, type MetricFilter } from "@/lib/api-client";
import { useStatement } from "@/lib/hooks/use-statement";
import { useSpendTrend } from "@/lib/hooks/use-spend-trend";
import { useSession } from "@/lib/hooks/use-session";
import { DEFAULT_PERIOD, PERIOD_OPTIONS, periodToWindow, type PeriodId } from "@/lib/period";

/**
 * cogent-ui-implementation-spec.md §2.2 — the Statement screen, assembled
 * from the real, independently-built pieces above. AskBar's dispatch below
 * is the one deliberately stubbed piece (§3); everything it calls is real.
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

  function pushAnswer(entry: AnswerLogEntry) {
    setAnswerLog((log) => [entry, ...log].slice(0, MAX_ANSWER_LOG_ENTRIES));
  }

  function applyExample(text: string) {
    setQuestion(text);
  }

  async function handleSubmit() {
    const q = question.trim();
    const id = crypto.randomUUID();
    const estimatedTokens = estimateTokens(q);

    if (estimatedTokens > MAX_QUESTION_TOKENS) {
      pushAnswer({ id, type: "budget_exceeded", question: q, estimatedTokens, maxTokens: MAX_QUESTION_TOKENS });
      setQuestion("");
      return;
    }

    const questionClass = classifyQuestion(q);
    if (questionClass === "out_of_scope") {
      pushAnswer({ id, type: "out_of_scope", question: q, reason: OUT_OF_SCOPE_REASON, rephraseChips: REPHRASE_CHIPS });
      setQuestion("");
      return;
    }

    setSubmitting(true);
    try {
      if (questionClass === "slice") {
        const filter: MetricFilter = { dimension: "team", value: "checkout-service" };
        const result = await getSpendMetric({ window, groupBy: "model", filter });
        const summary =
          result.intent === "slice"
            ? result.rows.map((r) => `${r.key} $${r.value.toFixed(2)}`).join(", ") || "no matching rows"
            : "no matching rows";
        pushAnswer({
          id,
          type: "answer",
          question: q,
          mapped: `getSpend · groupBy=model, filter=team:checkout-service · ${periodLabel}`,
          answerText: `Spend by model for team "checkout-service", ${periodLabel}: ${summary}.`,
          estimatedTokens,
        });
        setGrouping("model");
        setViewingFilter(filter);
      } else {
        const result = await getSpendMetric({ window });
        const value = result.intent === "point" ? result.value : 0;
        pushAnswer({
          id,
          type: "answer",
          question: q,
          mapped: `getSpend · ${periodLabel}`,
          answerText: `Spend, ${periodLabel}: $${value.toFixed(2)}.`,
          estimatedTokens,
        });
      }
    } catch {
      pushAnswer({
        id,
        type: "out_of_scope",
        question: q,
        reason: "Couldn't reach the query service. Try again.",
        rephraseChips: REPHRASE_CHIPS,
      });
    } finally {
      setSubmitting(false);
      setQuestion("");
    }
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
        <AnswerLog entries={answerLog} onRephrase={applyExample} />
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
          <StatementHeader measure={measure} totals={statement.data.totals} trend={trend.data} />
          <StatementTable rows={statement.data.rows} totals={statement.data.totals} measure={measure} />
        </>
      )}
    </div>
  );
}
