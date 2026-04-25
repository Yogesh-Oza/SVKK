import rateLimit from "express-rate-limit";

/** Default API rate limit (per IP) */
export const globalApiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" },
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, code: "TOO_MANY_REQUESTS", message: "Too many login attempts" },
});
