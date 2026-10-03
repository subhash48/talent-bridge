export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
