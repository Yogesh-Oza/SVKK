import type { Request } from "express";
import type { Env } from "../../config/env.js";
import type { CookieOptions } from "express";

export const REFRESH_COOKIE = "refreshToken" as const;
export const ACCESS_TOKEN_COOKIE = "accessToken" as const;
/** Some proxies or older clients store snake_case; we still emit camelCase. */
const ACCESS_TOKEN_SNAKE = "access_token" as const;
const REFRESH_SNAKE = "refresh_token" as const;

function firstCookie(req: Request, ...names: string[]): string | undefined {
  const c = req.cookies as Record<string, string> | undefined;
  if (!c) return undefined;
  for (const n of names) {
    const v = c[n];
    if (typeof v === "string" && v.length > 0) {
      return v;
    }
  }
  return undefined;
}

export function getAccessTokenFromCookies(req: Request): string | undefined {
  return firstCookie(req, ACCESS_TOKEN_COOKIE, ACCESS_TOKEN_SNAKE);
}

export function getRefreshTokenFromCookies(req: Request): string | undefined {
  return firstCookie(req, REFRESH_COOKIE, REFRESH_SNAKE);
}

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
  res.clearCookie(REFRESH_SNAKE, c);
  res.clearCookie(ACCESS_TOKEN_SNAKE, c);
}
