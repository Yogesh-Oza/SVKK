import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Env } from "../../config/env.js";
import { AppError } from "../../errors/app-error.js";
import type { ClaimLinkMode, CsvImportMode } from "@prisma/client";

const PREVIEW_TTL_MS = 15 * 60 * 1000;

export type ClaimPreviewPayload = {
  userId: string;
  checksum: string;
  filePath: string;
  linkMode: ClaimLinkMode;
  importMode: CsvImportMode;
  fileName: string;
  exp: number;
  nonce: string;
};

function previewSecret(env: Env): string {
  return env.ACCESS_TOKEN_SECRET;
}

/** Sign a preview token binding file checksum and import options. */
export function createPreviewToken(env: Env, payload: Omit<ClaimPreviewPayload, "exp" | "nonce">): string {
  const full: ClaimPreviewPayload = {
    ...payload,
    exp: Date.now() + PREVIEW_TTL_MS,
    nonce: randomBytes(16).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = createHmac("sha256", previewSecret(env)).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verify preview token and return payload. */
export function verifyPreviewToken(env: Env, token: string, userId: string): ClaimPreviewPayload {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new AppError("INVALID_PREVIEW_TOKEN", "Invalid preview token", 400);
  }
  const [body, sig] = parts as [string, string];
  const expected = createHmac("sha256", previewSecret(env)).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError("INVALID_PREVIEW_TOKEN", "Invalid preview token signature", 400);
  }

  let payload: ClaimPreviewPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ClaimPreviewPayload;
  } catch {
    throw new AppError("INVALID_PREVIEW_TOKEN", "Invalid preview token payload", 400);
  }

  if (payload.userId !== userId) {
    throw new AppError("FORBIDDEN", "Preview token does not belong to this user", 403);
  }
  if (Date.now() > payload.exp) {
    throw new AppError("PREVIEW_EXPIRED", "Preview token expired; upload again", 410);
  }
  return payload;
}

/** Hash preview token for optional job linkage. */
export function hashPreviewToken(token: string): string {
  return createHmac("sha256", "claim-preview").update(token).digest("hex");
}

export const CLAIM_PREVIEW_ROW_LIMIT = 20;

export type ClaimImportMatchStats = {
  totalRows: number;
  matchedExact: number;
  unlinked: number;
  conflicts: number;
  verificationWarnings: number;
  created: number;
  updated: number;
  failed: number;
};

export function emptyMatchStats(): ClaimImportMatchStats {
  return {
    totalRows: 0,
    matchedExact: 0,
    unlinked: 0,
    conflicts: 0,
    verificationWarnings: 0,
    created: 0,
    updated: 0,
    failed: 0,
  };
}
