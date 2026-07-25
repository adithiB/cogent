"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METRIC_LABEL, formatCount, formatMs, formatPercent, formatUsd, metricCellValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Metric, StatementRow } from "@/lib/api-client";

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
}: {
  row: StatementRow;
  measure: Metric;
  isTotal?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const otherColumns = COLUMNS.filter((c) => c !== measure);
  const detailId = `statement-row-detail-${row.lineItem}`;

  return (
    <>
      <TableRow
        className={isTotal ? "border-t-2 border-t-border-strong font-medium" : undefined}
        aria-label={
          isTotal
            ? `Total: ${METRIC_LABEL[measure]} ${metricCellValue(measure, row)}`
            : `${row.lineItem}: ${METRIC_LABEL[measure]} ${metricCellValue(measure, row)}`
        }
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
            <span className="font-sans">{row.lineItem}</span>
          </span>
        </TableCell>
        {COLUMNS.map((column) => (
          <TableCell
            key={column}
            className={cn(
              "text-right font-mono tabular-nums",
              columnVisibility(column, measure),
              column === measure && "font-medium",
              column === measure && column === "spend" && "text-accent",
              column === measure && column !== "spend" && "text-text",
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
}: {
  rows: StatementRow[];
  totals: StatementRow;
  measure: Metric;
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
          <StatementTableRow key={row.lineItem} row={row} measure={measure} />
        ))}
        <StatementTableRow row={{ ...totals, lineItem: "Total" }} measure={measure} isTotal />
      </TableBody>
    </Table>
  );
}
