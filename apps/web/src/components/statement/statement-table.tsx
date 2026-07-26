"use client";

import { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METRIC_LABEL, formatCount, formatMs, formatPercent, formatUsd, metricCellValue } from "@/lib/format";
import { formatConsumedPct, STATUS_INK_CLASS, STATUS_TINT_CLASS } from "@/lib/threshold";
import { cn } from "@/lib/utils";
import type { GroupingDimension, Metric, StatementRow } from "@/lib/api-client";
import type { BudgetAlertWithStatus } from "@/lib/hooks/use-budget-alerts";

/**
 * spec §2.2 responsive rule, expressed as one visibility function per
 * column: a non-active metric column is hidden below its breakpoint, but
 * the *active* Measure's column is never hidden — "<640 collapse to Line
 * item + active-measure column" means the active column survives every
 * breakpoint, only the other three collapse into the mobile disclosure.
 */
function columnVisibility(column: Metric, measure: Metric): string {
  if (column === measure) return "table-cell";
  return column === "errors" ? "hidden lg:table-cell" : "hidden sm:table-cell";
}

const COLUMNS: Metric[] = ["requests", "latency", "errors", "spend"];

/**
 * spec §1.7: a group row is marked only when an alert exists for *this exact
 * grouping dimension and value* and has actually been "reached" (warn/danger
 * — the on-track state marks nothing). "MVP ships one alert, so at most one
 * scope is ever marked" falls out of this naturally rather than being
 * special-cased: change the Grouping pill away from that alert's dimension
 * and no row matches, by construction.
 */
function matchingReachedAlert(
  alerts: BudgetAlertWithStatus[],
  grouping: GroupingDimension,
  lineItem: string,
): BudgetAlertWithStatus | undefined {
  return alerts.find(
    (a) => a.scope.dimension === grouping && a.scope.value === lineItem && a.reading.status !== "ok",
  );
}

function cellText(column: Metric, row: StatementRow): string {
  switch (column) {
    case "requests":
      return formatCount(row.requests);
    case "latency":
      return formatMs(row.p95Ms);
    case "errors":
      return formatPercent(row.errorRatePct);
    case "spend":
      return formatUsd(row.spendMicros);
  }
}

function StatementTableRow({
  row,
  measure,
  isTotal = false,
  budgetAlert,
}: {
  row: StatementRow;
  measure: Metric;
  isTotal?: boolean;
  budgetAlert?: BudgetAlertWithStatus;
}) {
  const [expanded, setExpanded] = useState(false);
  const otherColumns = COLUMNS.filter((c) => c !== measure);
  const detailId = `statement-row-detail-${row.lineItem}`;

  const inkClass = budgetAlert ? STATUS_INK_CLASS[budgetAlert.reading.status] : undefined;
  const rowLabel = budgetAlert
    ? `${row.lineItem}, ${budgetAlert.reading.status === "danger" ? "over" : "near"} budget alert, ` +
      `${formatConsumedPct(budgetAlert.reading.consumedPct)} of ${formatUsd(budgetAlert.capMicros)} cap`
    : isTotal
      ? `Total: ${METRIC_LABEL[measure]} ${metricCellValue(measure, row)}`
      : `${row.lineItem}: ${METRIC_LABEL[measure]} ${metricCellValue(measure, row)}`;

  return (
    <>
      <TableRow
        className={cn(
          isTotal && "border-t-2 border-t-border-strong font-medium",
          budgetAlert && STATUS_TINT_CLASS[budgetAlert.reading.status],
        )}
        aria-label={rowLabel}
      >
        <TableCell className="font-mono text-text">
          <span className="flex items-center gap-1.5">
            {!isTotal && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-controls={detailId}
                aria-label={`${expanded ? "Hide" : "Show"} other metrics for ${row.lineItem}`}
                className="shrink-0 text-text-faint sm:hidden"
              >
                <ChevronRight size={14} className={cn("transition-transform", expanded && "rotate-90")} />
              </button>
            )}
            {budgetAlert && (
              <AlertTriangle size={14} className={cn("shrink-0", inkClass)} aria-hidden="true" />
            )}
            <span className="font-sans">{row.lineItem}</span>
            {budgetAlert && (
              <span
                className={cn(
                  "rounded-sm px-1.5 py-0.5 font-mono text-meta",
                  STATUS_TINT_CLASS[budgetAlert.reading.status],
                  inkClass,
                )}
              >
                {formatConsumedPct(budgetAlert.reading.consumedPct)} of {formatUsd(budgetAlert.capMicros)} cap
              </span>
            )}
          </span>
        </TableCell>
        {COLUMNS.map((column) => (
          <TableCell
            key={column}
            className={cn(
              "text-right font-mono tabular-nums",
              columnVisibility(column, measure),
              column === measure && "font-medium",
              column === measure && column === "spend" && !budgetAlert && "text-accent",
              column === measure && column !== "spend" && "text-text",
              column === "spend" && budgetAlert && inkClass,
            )}
          >
            {cellText(column, row)}
          </TableCell>
        ))}
      </TableRow>

      {!isTotal && (
        <tr id={detailId} className="sm:hidden" hidden={!expanded}>
          <td colSpan={2} className="pb-3">
            <dl className="ml-5 grid grid-cols-2 gap-x-4 gap-y-1 text-secondary">
              {otherColumns.map((column) => (
                <div key={column} className="flex justify-between gap-2">
                  <dt className="text-text-muted">{METRIC_LABEL[column]}</dt>
                  <dd className="font-mono tabular-nums text-text">{cellText(column, row)}</dd>
                </div>
              ))}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

export function StatementTable({
  rows,
  totals,
  measure,
  grouping,
  alerts,
}: {
  rows: StatementRow[];
  totals: StatementRow;
  measure: Metric;
  grouping: GroupingDimension;
  alerts: BudgetAlertWithStatus[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Line item</TableHead>
          {COLUMNS.map((column) => (
            <TableHead
              key={column}
              scope="col"
              className={cn("text-right", columnVisibility(column, measure))}
            >
              {METRIC_LABEL[column]}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <StatementTableRow
            key={row.lineItem}
            row={row}
            measure={measure}
            budgetAlert={matchingReachedAlert(alerts, grouping, row.lineItem)}
          />
        ))}
        <StatementTableRow row={{ ...totals, lineItem: "Total" }} measure={measure} isTotal />
      </TableBody>
    </Table>
  );
}
