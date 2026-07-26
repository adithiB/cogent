"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { SitsIndicator } from "./sits-indicator";
import { useBudgetScopeOptions, useCreateBudgetAlert, useScopedSpendPreview } from "@/lib/hooks/use-budget-alerts";
import { useSession } from "@/lib/hooks/use-session";
import { capMicrosFor } from "@/lib/threshold";
import { cn } from "@/lib/utils";
import { ApiError, type BudgetScope, type BudgetScopeDimension, type BudgetThresholdType } from "@/lib/api-client";

function scopeKey(scope: { dimension: BudgetScopeDimension; value: string | null }): string {
  return scope.dimension === "total" ? "total" : `${scope.dimension}:${scope.value}`;
}

function scopeLabel(scope: { dimension: BudgetScopeDimension; value: string | null }): string {
  if (scope.dimension === "total") return "Total spend (org-wide)";
  const dimLabel = scope.dimension[0].toUpperCase() + scope.dimension.slice(1);
  return `${dimLabel}: ${scope.value}`;
}

interface ParsedAmount {
  value?: number;
  error?: string;
}

function parseDollars(raw: string): ParsedAmount {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Required." };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return { error: "Enter a valid amount." };
  return { value: n };
}

function parsePercent(raw: string): ParsedAmount {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Required." };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return { error: "Enter a percent between 0 and 100." };
  return { value: n };
}

/**
 * cogent-ui-implementation-spec.md §2.4's "New budget alert" card. `notify`
 * is rendered from the session's own email — it is never sent in the create
 * payload (the DTO has no field for it; the server derives it from the
 * verified token, same discipline as `orgId`), so there is nothing here to
 * wire beyond display.
 */
export function AlertForm({ onCreated }: { onCreated: (scopeText: string) => void }) {
  const session = useSession();
  const scopeOptions = useBudgetScopeOptions();
  const createAlert = useCreateBudgetAlert();

  const [scope, setScope] = useState<BudgetScope>({ dimension: "total", value: null });
  const [thresholdType, setThresholdType] = useState<BudgetThresholdType>("amount");
  const [thresholdAmount, setThresholdAmount] = useState("");
  const [thresholdPercent, setThresholdPercent] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const amountParsed = parseDollars(thresholdAmount);
  const percentParsed = parsePercent(thresholdPercent);
  const budgetParsed = parseDollars(budgetAmount);

  const spendPreview = useScopedSpendPreview(scope);

  const capMicros = useMemo(() => {
    if (thresholdType === "amount") {
      return amountParsed.value !== undefined ? Math.round(amountParsed.value * 1e6) : undefined;
    }
    if (percentParsed.value === undefined || budgetParsed.value === undefined) return undefined;
    return capMicrosFor({
      thresholdType: "percent",
      thresholdAmountMicros: null,
      thresholdPercent: percentParsed.value,
      budgetAmountMicros: Math.round(budgetParsed.value * 1e6),
    });
  }, [thresholdType, amountParsed.value, percentParsed.value, budgetParsed.value]);

  const email = session.data?.user.email ?? "";
  const label = scopeLabel(scope);
  const subjectText = scope.dimension === "total" ? "your account's" : `${scope.value}`;

  const previewSentence = (() => {
    if (thresholdType === "amount") {
      if (amountParsed.value === undefined) return null;
      return `Alert ${email} when ${subjectText} spend crosses $${amountParsed.value.toFixed(2)} in a calendar month.`;
    }
    if (percentParsed.value === undefined || budgetParsed.value === undefined) return null;
    const capDollars = (capMicros ?? 0) / 1e6;
    return `Alert ${email} when ${subjectText} spend crosses ${percentParsed.value}% of $${budgetParsed.value.toFixed(2)} budget ($${capDollars.toFixed(2)}) in a calendar month.`;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (thresholdType === "amount" ? amountParsed.error : percentParsed.error || budgetParsed.error) {
      return;
    }

    try {
      if (thresholdType === "amount") {
        await createAlert.mutateAsync({
          scopeDimension: scope.dimension,
          scopeValue: scope.dimension === "total" ? undefined : (scope.value ?? undefined),
          thresholdType: "amount",
          thresholdAmount: amountParsed.value!,
        });
      } else {
        await createAlert.mutateAsync({
          scopeDimension: scope.dimension,
          scopeValue: scope.dimension === "total" ? undefined : (scope.value ?? undefined),
          thresholdType: "percent",
          thresholdPercent: percentParsed.value!,
          budgetAmount: budgetParsed.value!,
        });
      }
      onCreated(label);
      setThresholdAmount("");
      setThresholdPercent("");
      setBudgetAmount("");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-card-title text-text">New budget alert</h2>
      <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="budget-scope" className="text-secondary font-medium text-text">
            Scope
          </label>
          <Select
            id="budget-scope"
            className="mt-1"
            value={scopeKey(scope)}
            onChange={(e) => {
              const key = e.target.value;
              if (key === "total") {
                setScope({ dimension: "total", value: null });
                return;
              }
              const [dimension, value] = key.split(":") as [BudgetScopeDimension, string];
              setScope({ dimension, value });
            }}
          >
            <option value="total">Total spend (org-wide)</option>
            {scopeOptions.data
              ?.filter((o) => o.dimension !== "total")
              .map((o) => (
                <option key={scopeKey(o)} value={scopeKey(o)}>
                  {scopeLabel(o)}
                </option>
              ))}
          </Select>
        </div>

        <div>
          <span className="text-secondary font-medium text-text">Threshold</span>
          <div className="mt-1 flex items-start gap-2">
            {thresholdType === "amount" ? (
              <div className="flex-1">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint">$</span>
                  <Input
                    inputMode="decimal"
                    className="pl-6"
                    value={thresholdAmount}
                    onChange={(e) => setThresholdAmount(e.target.value)}
                    aria-label="Threshold amount"
                    aria-invalid={thresholdAmount !== "" && !!amountParsed.error}
                    aria-describedby="threshold-amount-error"
                  />
                </div>
                {thresholdAmount !== "" && amountParsed.error && (
                  <p id="threshold-amount-error" className="mt-1 flex items-center gap-1 text-meta text-danger-ink">
                    <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                    {amountParsed.error}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="relative w-24">
                    <Input
                      inputMode="decimal"
                      className="pr-6"
                      value={thresholdPercent}
                      onChange={(e) => setThresholdPercent(e.target.value)}
                      aria-label="Threshold percent"
                      aria-invalid={thresholdPercent !== "" && !!percentParsed.error}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-faint">%</span>
                  </div>
                  <span className="text-text-muted">of budget</span>
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint">$</span>
                    <Input
                      inputMode="decimal"
                      className="pl-6"
                      value={budgetAmount}
                      onChange={(e) => setBudgetAmount(e.target.value)}
                      aria-label="Budget amount"
                      aria-invalid={budgetAmount !== "" && !!budgetParsed.error}
                    />
                  </div>
                </div>
                {thresholdPercent !== "" && percentParsed.error && (
                  <p className="flex items-center gap-1 text-meta text-danger-ink">
                    <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                    {percentParsed.error}
                  </p>
                )}
                {budgetAmount !== "" && budgetParsed.error && (
                  <p className="flex items-center gap-1 text-meta text-danger-ink">
                    <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                    {budgetParsed.error}
                  </p>
                )}
              </div>
            )}

            <RadioGroup
              value={thresholdType}
              onValueChange={(v) => setThresholdType(v as BudgetThresholdType)}
              aria-label="Threshold type"
              className="inline-flex shrink-0 gap-0.5 rounded-md border border-border bg-inset p-0.5"
            >
              {(["amount", "percent"] as const).map((t) => (
                <RadioGroupItem
                  key={t}
                  value={t}
                  className={cn(
                    "cursor-pointer rounded-sm px-2.5 py-1.5 text-body text-text-muted outline-none transition-colors",
                    "hover:text-text",
                    "data-[state=checked]:bg-surface data-[state=checked]:font-medium data-[state=checked]:text-text",
                    "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
                  )}
                >
                  {t === "amount" ? "$" : "% of budget"}
                </RadioGroupItem>
              ))}
            </RadioGroup>
          </div>
        </div>

        <div>
          <label htmlFor="budget-notify" className="text-secondary font-medium text-text">
            Notify
          </label>
          <Select id="budget-notify" className="mt-1" value={email} onChange={() => {}}>
            <option value={email}>{email || "…"}</option>
          </Select>
        </div>

        <p aria-live="polite" className="min-h-[2.5em] text-secondary text-text-muted">
          {previewSentence ?? "Set a threshold to preview the alert."}
        </p>

        <SitsIndicator currentSpendMicros={spendPreview.data} capMicros={capMicros} loading={spendPreview.isPending} />

        {submitError && (
          <p role="alert" className="flex items-center gap-1 text-body text-danger-ink">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {submitError}
          </p>
        )}

        <Button type="submit" disabled={createAlert.isPending}>
          {createAlert.isPending && (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          )}
          Create alert
        </Button>
      </form>
    </div>
  );
}
