import { showToast } from "./toast";

/** Halaman login: server menyajikannya di /admin/login; di mode dev (Vite) ada di /_app/login.html. */
export const LOGIN_URL = import.meta.env.DEV ? "/_app/login.html" : "/admin/login";

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Jangan tampilkan toast error (pemanggil menanganinya sendiri). */
  silent?: boolean;
}

/**
 * Memanggil /api/admin/<path>. Melempar Error berisi pesan dari server jika gagal,
 * dan mengarahkan ke halaman login saat sesi habis (401).
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
      throw new Error(data.error || "Terjadi kesalahan");
    }
    return data as T;
  } catch (err) {
    if (!opts.silent) showToast((err as Error).message, true);
    throw err;
  }
}
