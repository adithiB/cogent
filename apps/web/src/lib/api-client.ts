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
