import { AxiosError, type AxiosRequestConfig, type Method } from "axios";
import { backendApi } from "./http";
import { getSvkkApiBase } from "./config";

export { getSvkkAccessToken, setSvkkAccessToken } from "./auth-tokens";
export { backendApi, apiGet, apiPost, apiPatch, apiPut, apiDelete, refreshSvkkAccessToken } from "./http";

function normalizePath(path: string): string {
  if (path.startsWith("http")) {
    return path;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * `fetch`-compatible wrapper (e.g. file upload, plain-text responses).
 * Paths are under `NEXT_PUBLIC_API_URL` (e.g. `/upload/csv`).
 */
export async function svkkFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!getSvkkApiBase()) {
    throw new Error("NEXT_PUBLIC_API_URL is not set");
  }

  const method = (init.method?.toUpperCase() ?? "GET") as Method;
  const isForm = init.body instanceof FormData;
  const rel = normalizePath(path);

  const config: AxiosRequestConfig = {
    url: rel,
    method,
    data: method === "GET" || method === "HEAD" ? undefined : init.body,
    responseType: "text",
    transformResponse: [(d) => d],
  };

  if (!isForm) {
    config.headers = { "Content-Type": "application/json" };
  }

  try {
    const res = await backendApi.request<string>(config);
    return new Response(res.data, { status: res.status, statusText: res.statusText });
  } catch (e) {
    if (e instanceof AxiosError && e.response) {
      const data =
        typeof e.response.data === "string" ? e.response.data : String(e.response.data);
      return new Response(data, { status: e.response.status, statusText: e.response.statusText });
    }
    throw e;
  }
}

/**
 * JSON helper; throws on error with an `Error` whose message comes from the API when possible.
 */
export async function svkkJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!getSvkkApiBase()) {
    throw new Error("NEXT_PUBLIC_API_URL is not set");
  }

  const method = (init.method?.toUpperCase() ?? "GET") as Method;
  const isForm = init.body instanceof FormData;
  const rel = normalizePath(path);

  const config: AxiosRequestConfig = {
    url: rel,
    method,
    data: method === "GET" || method === "HEAD" ? undefined : init.body,
  };

  if (!isForm) {
    config.headers = { "Content-Type": "application/json" };
  }

  try {
    const { data } = await backendApi.request<T>(config);
    return data;
  } catch (e) {
    if (e instanceof AxiosError && e.response) {
      const body = e.response.data as { message?: string } | string | undefined;
      const msg =
        typeof body === "object" && body && "message" in body && body.message
          ? String(body.message)
          : (e as Error).message;
      throw new Error(msg);
    }
    throw e;
  }
}
