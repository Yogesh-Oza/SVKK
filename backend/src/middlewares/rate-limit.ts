import rateLimit from "express-rate-limit";

const WINDOW_MS = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const isDev = process.env.NODE_ENV === "development";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Default API rate limit (per IP). Higher in development for list/MIS/filter churn. */
export const globalApiRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  max: parsePositiveInt(process.env.RATE_LIMIT_API_MAX, isDev ? 5000 : 1000),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" },
});

export const authRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  max: parsePositiveInt(process.env.RATE_LIMIT_AUTH_MAX, isDev ? 100 : 50),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, code: "TOO_MANY_REQUESTS", message: "Too many login attempts" },
});

/** Stricter limit for RBAC role/permission mutations */
export const rbacRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  max: parsePositiveInt(process.env.RATE_LIMIT_RBAC_MAX, isDev ? 300 : 150),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" },
});
