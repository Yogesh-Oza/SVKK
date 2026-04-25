import type { Env } from "../../config/env.js";
import type { CookieOptions } from "express";

export const REFRESH_COOKIE = "refreshToken" as const;
export const ACCESS_TOKEN_COOKIE = "accessToken" as const;

/**
 * Cross-origin SPA (e.g. Vercel) calling API (e.g. Render) needs `SameSite=None; Secure`
 * or the browser will not attach cookies to XHR/fetch, even with `withCredentials: true`.
 */
function cookieBase(env: Env): Pick<CookieOptions, "httpOnly" | "secure" | "sameSite" | "path"> {
  const none = env.COOKIE_SAME_SITE === "none";
  return {
    httpOnly: true,
    secure: none ? true : env.NODE_ENV === "production",
    sameSite: none ? "none" : "lax",
    path: "/",
  };
}

export function setRefreshCookie(res: import("express").Response, env: Env, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    ...cookieBase(env),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function setAccessCookie(res: import("express").Response, env: Env, token: string) {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...cookieBase(env),
    maxAge: accessTokenCookieMaxMs(env),
  });
}

function accessTokenCookieMaxMs(env: Env): number {
  const s = String(env.ACCESS_TOKEN_EXPIRES).trim();
  const m = /^(\d+)([mhd])$/i.exec(s);
  if (!m) return 15 * 60 * 1000;
  const n = parseInt(m[1]!, 10);
  const u = m[2]!.toLowerCase();
  if (u === "m") return n * 60 * 1000;
  if (u === "h") return n * 60 * 60 * 1000;
  if (u === "d") return n * 24 * 60 * 60 * 1000;
  return 15 * 60 * 1000;
}

export function clearAuthCookies(res: import("express").Response, env: Env) {
  const c = { ...cookieBase(env) };
  res.clearCookie(REFRESH_COOKIE, c);
  res.clearCookie(ACCESS_TOKEN_COOKIE, c);
}
