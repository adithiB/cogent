const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

/**
 * `credentials: 'include'` on every call is the entire client-side auth
 * story (spec §2.1: "token issuance is server-side and invisible to the
 * UI"). This client never reads or sets a token — it sends cookies and
 * reads a JSON body describing session state, nothing else.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => undefined);

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : undefined) ?? "Something went wrong. Please try again.";
    throw new ApiError(message, res.status, body);
  }

  return body as T;
}

export interface SessionResponse {
  authenticated: true;
  org: { name: string };
  user: { email: string };
  role: "owner" | "member";
}

export function signup(input: { email: string; password: string; orgName: string }) {
  return request<SessionResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function login(input: { email: string; password: string }) {
  return request<SessionResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout() {
  return request<{ authenticated: false }>("/auth/logout", { method: "POST" });
}

export function getSession() {
  return request<SessionResponse>("/auth/session");
}

/**
 * Mirrors `apps/api/src/usage/types.ts` — duplicated here rather than
 * imported because there is no shared package between `apps/api` and
 * `apps/web` in this workspace (same pattern as `SessionResponse` above,
 * which doesn't import the API's own session-response shape either).
 */
export type Dimension = "project" | "team" | "model" | "time";
export type Metric = "spend" | "latency" | "requests" | "errors";
export type GroupingDimension = Exclude<Dimension, "time">;

export interface TimeWindow {
  from: Date;
  to: Date;
}

export interface MetricFilter {
  dimension: GroupingDimension;
  value: string;
}

export interface StatementRow {
  lineItem: string;
  requests: number;
  p95Ms: number;
  errorRatePct: number;
  spendMicros: number;
}

export interface StatementResponse {
  rows: StatementRow[];
  totals: StatementRow;
}

export type MetricResult =
  | { intent: "point"; metric: Metric; value: number; unit: string }
  | { intent: "slice"; metric: Metric; groupBy: Dimension; rows: { key: string; value: number }[] };

function windowParams(window: TimeWindow): URLSearchParams {
  return new URLSearchParams({
    from: window.from.toISOString(),
    to: window.to.toISOString(),
  });
}

function appendFilter(params: URLSearchParams, filter?: MetricFilter): void {
  if (!filter) return;
  params.set("filterDimension", filter.dimension);
  params.set("filterValue", filter.value);
}

export function getStatement(args: {
  window: TimeWindow;
  groupBy: GroupingDimension;
  filter?: MetricFilter;
}) {
  const params = windowParams(args.window);
  params.set("groupBy", args.groupBy);
  appendFilter(params, args.filter);
  return request<StatementResponse>(`/v1/usage/statement?${params.toString()}`);
}

/**
 * `getSpend` (ADR-0002 §3b), over HTTP. Only `spend` is wired as a
 * single-metric route this session — the Statement's other three metrics
 * (latency/requests/errors) are already served in aggregate by
 * `getStatement`'s `totals` (the header hero swap needs nothing else); a
 * per-metric point/slice route for them is the assistant's job once its
 * real backend wiring lands (spec §3), not this screen's.
 */
export function getSpendMetric(args: {
  window: TimeWindow;
  groupBy?: Dimension;
  filter?: MetricFilter;
}) {
  const params = windowParams(args.window);
  if (args.groupBy) params.set("groupBy", args.groupBy);
  appendFilter(params, args.filter);
  return request<MetricResult>(`/v1/usage/spend?${params.toString()}`);
}

/**
 * Mirrors `apps/api/src/assistant/types.ts` and `tools.ts` (ADR-0004 + its
 * 2026-07-23/24 amendment) — same "duplicated, not imported" convention as
 * every other type in this file. `args.window` carries ISO date-time
 * strings, not `Date` — this is JSON straight off the wire, not the
 * server-side `MetricArgs` (whose `window` is real `Date`).
 */
export type MetricToolName = "getSpend" | "getRequestVolume" | "getLatency" | "getErrorRate";

export interface AssistantMetricArgs {
  window: { from: string; to: string };
  groupBy?: Dimension;
  filter?: MetricFilter;
}

export interface MappedTo {
  function: MetricToolName;
  args: AssistantMetricArgs;
}

/**
 * The real response envelope (`AssistantAnswerEnvelope`). No `costUsd`/
 * `capUsd` field anywhere — the amendment removed the dollar framing because
 * Ollama is local and has no per-token cost; `usage` reports real measured
 * tokens + wall-time instead, and the blocked variant reports the token
 * budget that refused the query, never a dollar figure.
 */
export type AssistantAnswerEnvelope =
  | {
      type: "answer";
      result: MetricResult;
      mapped: MappedTo;
      answerText: string;
      usage: { promptTokens: number; completionTokens: number; durationMs: number };
    }
  | {
      type: "out_of_scope";
      reason: string;
      rephraseChips: string[];
    }
  | {
      type: "budget_exceeded";
      estimatedQuestionTokens: number;
      maxQuestionTokens: number;
    };

/**
 * `POST /v1/assistant/ask` (ADR-0004). A real Ollama call — several seconds
 * of warm-state latency, more on a cold model load — not a snappy API round
 * trip; callers must reflect that honestly in their loading state.
 */
export function askAssistant(question: string) {
  return request<AssistantAnswerEnvelope>("/v1/assistant/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

/**
 * cogent-ui-implementation-spec.md §2.4. Mirrors `apps/api/src/budgets/types.ts`
 * — duplicated here rather than shared, same reasoning as every other type
 * in this file (no shared package between `apps/api` and `apps/web`).
 */
export type BudgetScopeDimension = "total" | "project" | "team" | "model";
export type BudgetThresholdType = "amount" | "percent";

export interface BudgetScope {
  dimension: BudgetScopeDimension;
  value: string | null;
}

export interface BudgetScopeOption {
  dimension: BudgetScopeDimension;
  value: string | null;
}

export interface BudgetAlert {
  id: string;
  scope: BudgetScope;
  thresholdType: BudgetThresholdType;
  thresholdAmountMicros: number | null;
  thresholdPercent: number | null;
  budgetAmountMicros: number | null;
  capMicros: number;
  notifyEmail: string;
  createdAt: string;
}

export type CreateBudgetAlertInput =
  | {
      scopeDimension: BudgetScopeDimension;
      scopeValue?: string;
      thresholdType: "amount";
      thresholdAmount: number;
    }
  | {
      scopeDimension: BudgetScopeDimension;
      scopeValue?: string;
      thresholdType: "percent";
      thresholdPercent: number;
      budgetAmount: number;
    };

export function listBudgetAlerts() {
  return request<BudgetAlert[]>("/v1/budget-alerts");
}

export function getBudgetScopeOptions() {
  return request<BudgetScopeOption[]>("/v1/budget-alerts/scope-options");
}

export function createBudgetAlert(input: CreateBudgetAlertInput) {
  return request<BudgetAlert>("/v1/budget-alerts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function removeBudgetAlert(id: string) {
  return request<void>(`/v1/budget-alerts/${id}`, { method: "DELETE" });
}
