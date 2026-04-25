import axios, {
  AxiosHeaders,
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { getSvkkApiBase } from "@/lib/svkk/config";

type Retriable = InternalAxiosRequestConfig & { _svkkAuthRetry?: boolean };

/**
 * `POST /auth/refresh` — new access in httpOnly cookie; body `accessToken` is used
 * for an immediate 401 retry when the browser has not yet applied the cookie.
 */
export async function refreshSvkkAccessToken(): Promise<string | null> {
  const base = getSvkkApiBase();
  if (!base) {
    return null;
  }
  try {
    const { data } = await axios.post<{ accessToken?: string }>(
      `${base}/auth/refresh`,
      null,
      { withCredentials: true, timeout: 30_000 },
    );
    if (data?.accessToken) {
      return data.accessToken;
    }
    return "";
  } catch {
    return null;
  }
}

/**
 * SVKK Express API — httpOnly `accessToken` + `refreshToken` cookies, `withCredentials: true`.
 * 401: refresh once, retry (Bearer from refresh body if needed for same-tick cookie timing).
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

    const at = await refreshSvkkAccessToken();
    if (at !== null) {
      if (at.length > 0) {
        const h = AxiosHeaders.from(original.headers);
        h.set("Authorization", `Bearer ${at}`);
        original.headers = h;
      }
      return backendApi.request(original);
    }

    return Promise.reject(error);
  },
);

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
