import { getSvkkApiBase } from "./config";

const TOKEN_KEY = "svkk_access_token";

let memoryToken: string | null = null;

/**
 * In-memory access token; falls back to `sessionStorage` in the browser.
 */
export function getSvkkAccessToken(): string | null {
  if (typeof window === "undefined") {
    return memoryToken;
  }
  return memoryToken ?? sessionStorage.getItem(TOKEN_KEY);
}

export function setSvkkAccessToken(token: string | null): void {
  memoryToken = token;
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * Fetches the SVKK API with Bearer auth, `credentials: "include"` for refresh cookie, and one refresh retry on 401.
 */
export async function svkkFetch(
  path: string,
  init: RequestInit = {},
  didRetry = false,
): Promise<Response> {
  const base = getSvkkApiBase();
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_URL is not set");
  }
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(init.headers);
  const t = getSvkkAccessToken();
  if (t) {
    headers.set("Authorization", `Bearer ${t}`);
  }
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers, credentials: "include" });

  if (res.status === 401 && !didRetry && !path.includes("/auth/refresh")) {
    const refresh = await fetch(`${base}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refresh.ok) {
      const data: { accessToken?: string } = await refresh.json();
      if (data.accessToken) {
        setSvkkAccessToken(data.accessToken);
        return svkkFetch(path, init, true);
      }
    }
    setSvkkAccessToken(null);
  }

  return res;
}

/**
 * JSON helper; throws on non-OK with body message when available.
 */
export async function svkkJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await svkkFetch(path, init);
  const text = await res.text();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = JSON.parse(text) as { message?: string; code?: string };
      if (j.message) {
        msg = j.message;
      }
    } catch {
      if (text) {
        msg = text;
      }
    }
    throw new Error(msg);
  }
  return (text ? JSON.parse(text) : {}) as T;
}
