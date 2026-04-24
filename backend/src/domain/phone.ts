import { AppError } from "../errors/app-error.js";

const DEFAULT_CC = "91";
const DIGITS_ONLY = /^\d+$/;

/**
 * Normalize user input to E.164 using India +91 as default country (Phase 1).
 *
 * @param raw - Raw phone string from UI or CSV
 * @returns E.164 e.g. +919876543210
 * @throws AppError INVALID_MOBILE
 */
export function normalizeMobile(raw: string): string {
  const trimmed = raw.trim().replace(/[\s\-().]/g, "");
  if (!trimmed) {
    throw new AppError("INVALID_MOBILE", "Mobile is required", 400);
  }

  let digits = trimmed;
  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  }

  if (!DIGITS_ONLY.test(digits)) {
    throw new AppError("INVALID_MOBILE", "Mobile must contain digits only (after +)", 400);
  }

  if (digits.length === 10) {
    return `+${DEFAULT_CC}${digits}`;
  }

  if (digits.startsWith(DEFAULT_CC) && digits.length === 12) {
    return `+${digits}`;
  }

  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new AppError(
    "INVALID_MOBILE",
    "Mobile length invalid for India (+91) default rules",
    400,
  );
}
