export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Mock mode serves seeded data from services/mock until the FastAPI staff façade ships.
 * Set NEXT_PUBLIC_USE_MOCK_API=false to send every service call to API_URL instead.
 */
export const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";

type ApiInit = RequestInit & { token?: string };

// Thin client for the FastAPI backend: JSON in and out, Bearer token from the Supabase session.
export async function apiFetch<T>(path: string, { token, headers, ...init }: ApiInit = {}): Promise<T> {
  const merged = new Headers(headers);
  merged.set("Content-Type", "application/json");
  if (token) merged.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers: merged });
  if (!response.ok) {
    throw new Error(`API ${response.status} on ${path}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
