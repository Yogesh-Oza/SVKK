/**
 * Legacy ETL tunables — edit maps without touching runner logic.
 * Bump on breaking transform/apply changes; resume requires matching version.
 */
export const migrationVersion = "v1";
export const CURRENT_VERSION = migrationVersion;

export const POLICY_TYPE_MAP: Record<string, { policyTypeKey: string }> = {
  "family-floater": { policyTypeKey: "ad_policy" },
  "family-floating": { policyTypeKey: "ad_policy" },
  "familiy-floating": { policyTypeKey: "ad_policy" },
  individual: { policyTypeKey: "ad_policy" },
  "asha-kiran": { policyTypeKey: "asha_kiran" },
  "asha kiran": { policyTypeKey: "asha_kiran" },
};

/** Category letter from legacy `cat` → Prisma Category.key */
export const CATEGORY_LETTER_MAP: Record<string, string> = {
  a: "a",
  b: "b",
  c: "c",
  d: "d",
  e: "e",
  ashakiran: "asha_kiran_cat",
  "asha kiran": "asha_kiran_cat",
};

export const POLICY_GROUPING_MAP: Record<string, "SVKK" | "NVKK" | "RTY" | "OTHER"> = {
  svkk: "SVKK",
  nvkk: "NVKK",
  rty: "RTY",
  other: "OTHER",
};

export const defaultChunkSize = 500;
export const defaultProgressEveryN = 200;
export const defaultDbRetries = 3;
export const defaultRetryDelayMs = 400;

/** IANA timezone for legacy date-only columns before storing UTC midnight */
export const dateInputTimeZone = "Asia/Kolkata";

/** When member DOB is missing/invalid */
export const memberDobSentinelUtc = "1900-01-01T00:00:00.000Z";

/** Synthetic Indian mobile: +91 + 9 + 9 digits (see syntheticMobileFromRef) */
export const syntheticMobileDigitPrefix = "9";

export const migrationAuditTag = (refNo: string) =>
  `[legacy-import ${migrationVersion} ref=${refNo}]`;
