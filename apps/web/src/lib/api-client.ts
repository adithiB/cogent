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
