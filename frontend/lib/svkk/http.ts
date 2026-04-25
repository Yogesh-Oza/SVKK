import axios, {
  AxiosHeaders,
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { getSvkkApiBase } from "./config";
import { getSvkkAccessToken, setSvkkAccessToken } from "./auth-tokens";

type Retriable = InternalAxiosRequestConfig & { _svkkAuthRetry?: boolean };

/** Uses httpOnly `refreshToken` cookie; no JS-readable token storage. */
export async function refreshSvkkAccessToken(): Promise<boolean> {
  const base = getSvkkApiBase();
  if (!base) {
    return false;
  }
  try {
    const { data } = await axios.post<{ accessToken?: string }>(
      `${base}/auth/refresh`,
      null,
      { withCredentials: true, timeout: 30_000 },
    );
    if (data?.accessToken) {
      setSvkkAccessToken(data.accessToken);
      return true;
    }
    setSvkkAccessToken(null);
    return false;
  } catch {
    setSvkkAccessToken(null);
    return false;
  }
}

/**
 * Shared Axios instance for the Express SVKK API (`NEXT_PUBLIC_API_URL`, includes `/api/v1`).
 * Sends Bearer access token, `withCredentials` for httpOnly refresh cookie, and retries once
 * after `POST /auth/refresh` on 401.
 */
export const backendApi = axios.create({
  withCredentials: true,
  timeout: 120_000,
  headers: {
    "Content-Type": "application/json",
  },
});

backendApi.interceptors.request.use((config) => {
  const base = getSvkkApiBase();
  if (!base) {
    return Promise.reject(new Error("NEXT_PUBLIC_API_URL is not set"));
  }
  config.baseURL = base;

  const t = getSvkkAccessToken();
  if (t) {
    const h = AxiosHeaders.from(config.headers);
    h.set("Authorization", `Bearer ${t}`);
    config.headers = h;
  }

  if (config.data instanceof FormData) {
    const h = AxiosHeaders.from(config.headers);
    h.delete("Content-Type");
    config.headers = h;
  }

  return config;
});

backendApi.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as Retriable | undefined;
    const status = error.response?.status;

    if (
      !original ||
      status !== 401 ||
      original._svkkAuthRetry ||
      (original.url ?? "").includes("/auth/refresh") ||
      (original.url ?? "").includes("/auth/login")
    ) {
      return Promise.reject(error);
    }

    original._svkkAuthRetry = true;

    const ok = await refreshSvkkAccessToken();
    if (ok) {
      const t = getSvkkAccessToken();
      if (t) {
        const h = AxiosHeaders.from(original.headers);
        h.set("Authorization", `Bearer ${t}`);
        original.headers = h;
        return backendApi.request(original);
      }
    }

    return Promise.reject(error);
  },
);

/**
 * Typed helpers — prefer these for new code instead of ad-hoc `fetch`.
 */
export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await backendApi.get<T>(url, config);
  return data;
}

export async function apiPost<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await backendApi.post<T>(url, body, config);
  return data;
}

export async function apiPatch<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await backendApi.patch<T>(url, body, config);
  return data;
}

export async function apiPut<T, B = unknown>(
  url: string,
  body?: B,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await backendApi.put<T>(url, body, config);
  return data;
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await backendApi.delete<T>(url, config);
  return data;
}
