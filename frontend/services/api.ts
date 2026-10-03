/**
 * The FastAPI backend's versioned base, e.g. http://localhost:8000/api/v1. A bare origin such as
 * http://localhost:8000 gets /api/v1 appended, so either form works in NEXT_PUBLIC_API_URL.
 */
export const API_URL = withVersion(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1");

/**
 * Mock mode serves seeded in-browser data from services/mock, for working on the UI without the
 * backend. Opt in with NEXT_PUBLIC_USE_MOCK_API=true; by default every call goes to API_URL.
 */
export const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

/** An API failure with the backend's friendly message ({"error": {"code", "message"}}). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiInit = RequestInit & { token?: string };

// Thin client for the FastAPI backend: JSON in and out, Bearer token once Supabase Auth is added.
export async function apiFetch<T>(path: string, { token, headers, ...init }: ApiInit = {}): Promise<T> {
  const merged = new Headers(headers);
  if (init.body !== undefined) merged.set("Content-Type", "application/json");
  if (token) merged.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init, headers: merged });
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    throw new ApiError(`Can't reach the Talent Bridge API at ${API_URL}. Is the backend running?`, 0, "network_error");
  }
  if (!response.ok) throw await toApiError(response);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const { error } = (await response.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    if (error?.message) return new ApiError(error.message, response.status, error.code ?? "error", error.details);
  } catch {
    // Not our JSON error shape; fall through to a generic message.
  }
  const message = response.status >= 500 ? "Something went wrong on our side. Please try again." : `Request failed (${response.status}).`;
  return new ApiError(message, response.status, "http_error");
}

/** The message to show a person for anything a service call threw. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function withVersion(url: string): string {
  const base = url.replace(/\/+$/, "");
  return /\/api\/v\d+$/.test(base) ? base : `${base}/api/v1`;
}
