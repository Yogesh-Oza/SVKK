const base =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:4000/api/v1";

export type ApiErrorBody = {
  code: string;
  message: string;
  traceId: string;
};

export async function svkkFetch<T>(
  path: string,
  init?: RequestInit & { accessToken?: string | null },
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (init?.accessToken) {
    headers.set("Authorization", `Bearer ${init.accessToken}`);
  }
  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* ignore */
    }
    const err = new Error(body?.message || res.statusText) as Error & {
      code?: string;
      traceId?: string;
      status?: number;
    };
    err.code = body?.code;
    err.traceId = body?.traceId;
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function svkkLogin(email: string, password: string) {
  return svkkFetch<{ accessToken: string; user: { id: string; email: string; name: string; role: string } }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
}

export async function svkkRefresh() {
  return svkkFetch<{ accessToken: string }>("/auth/refresh", { method: "POST" });
}
