import { SUPABASE_CONFIGURED, createClient } from "@/lib/supabase";

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

type TokenSource = () => Promise<string | null>;

let serverTokenSource: TokenSource | null = null;

/** Set by lib/supabase-server.ts, which can read the session cookie while rendering on the server. */
export function setServerTokenSource(source: TokenSource) {
  serverTokenSource = source;
}

/**
 * The signed-in user's Supabase access token: from the request's cookies on the server, from the
 * browser session otherwise (refreshed first if it has expired). Null when nobody is signed in.
 */
async function accessToken(): Promise<string | null> {
  if (typeof window === "undefined") return serverTokenSource ? serverTokenSource() : null;
  if (!SUPABASE_CONFIGURED) return null;
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? null;
}

const AUTH_PAGES = ["/login", "/signup", "/forgot-password", "/reset-password", "/welcome"];

/**
 * This page's session can't be used any more, so leave for a page that fits it rather than show an
 * error. 401: it expired or ended, so sign in again and come back. 403: it now belongs to an account
 * that isn't allowed here, typically because someone signed in as another user in another tab (the
 * tabs share one session), so go home, which routes by the role on record. The sign-in pages handle
 * these responses themselves.
 */
function onAccessLost(error: ApiError) {
  const { pathname, search } = window.location;
  if (AUTH_PAGES.includes(pathname)) return;
  if (error.status === 401) {
    window.location.replace(`/login?reason=expired&next=${encodeURIComponent(pathname + search)}`);
  } else if (error.code === "account_not_linked" || error.code === "account_disabled") {
    window.location.replace(`/login?reason=${error.code}`);
  } else {
    window.location.replace("/");
  }
}

/**
 * True only when the API couldn't be reached or failed on its side (network error, 5xx): the cases
 * where showing the last data we have is right. A 4xx is the API answering, never an outage.
 */
export function isServerUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500);
}

/**
 * Thin client for the FastAPI backend: JSON in and out, and the signed-in user's access token on
 * every request. Callers never handle tokens; the API decides what that user may do.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(`${API_URL}${path}`, init);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * A file the API serves only to signed-in users, such as a résumé, sent with their token like
 * apiFetch. path is the API's own path for it (/api/v1/...), as API responses give it; it must
 * resolve to the API's origin, so the token never goes anywhere else.
 */
export async function apiDownload(path: string): Promise<Blob> {
  const url = new URL(path, API_URL);
  if (url.origin !== new URL(API_URL).origin) {
    throw new ApiError("This file isn't served by the Talent Bridge API.", 0, "invalid_path");
  }
  return (await send(url.href)).blob();
}

/** fetch with the user's token. Anything but a 2xx is an ApiError, and a session that's no longer valid leaves the page. */
async function send(url: string, { headers, ...init }: RequestInit = {}): Promise<Response> {
  const merged = new Headers(headers);
  if (init.body !== undefined && !merged.has("Content-Type")) merged.set("Content-Type", "application/json");
  const token = await accessToken();
  if (token) merged.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init, headers: merged });
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    throw new ApiError(`Can't reach the Talent Bridge API at ${API_URL}. Is the backend running?`, 0, "network_error");
  }
  if (!response.ok) {
    const error = await toApiError(response);
    if ((error.status === 401 || error.status === 403) && typeof window !== "undefined") onAccessLost(error);
    throw error;
  }
  return response;
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
