import type { Env } from "../../config/env.js";

export function extractPolicyDocumentUrl(policy: {
  policyUrl?: string | null;
  policyUrl2?: string | null;
}): string | null {
  const direct = policy.policyUrl2?.trim();
  if (direct) return direct;
  const raw = policy.policyUrl?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];
      if (typeof first === "string" && first.trim()) return first.trim();
    }
    if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
  } catch {
    /* plain URL string */
  }
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return raw;
}

export function buildPolicyPageUrl(env: Env, policyId: string): string {
  const base = (env.FRONTEND_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/policies/${policyId}`;
}

export function formatDateDmy(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
