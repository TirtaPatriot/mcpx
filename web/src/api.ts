import { showToast } from "./toast";

/** Login page: the gateway serves it at /admin/login; in dev mode (Vite) it lives at /_app/login.html. */
export const LOGIN_URL = import.meta.env.DEV ? "/_app/login.html" : "/admin/login";

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Do not show an error toast (the caller handles errors itself). */
  silent?: boolean;
}

/**
 * Calls /api/admin/<path>. Throws an Error carrying the server message on failure,
 * and redirects to the login page when the session has expired (401).
 */
export async function api<T = Record<string, any>>(path: string, opts: ApiOptions = {}): Promise<T> {
  try {
    const res = await fetch(`/api/admin${path}`, {
      method: opts.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = LOGIN_URL;
        return new Promise<T>(() => {});
      }
      throw new Error(data.error || "Something went wrong");
    }
    return data as T;
  } catch (err) {
    if (!opts.silent) showToast((err as Error).message, true);
    throw err;
  }
}
