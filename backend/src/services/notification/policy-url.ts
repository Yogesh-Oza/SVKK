import type { Env } from "../../config/env.js";

/** Parse `policyUrl` the same way as the policy form (JSON array or single URL). */
export function parsePolicyUrls(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as unknown;
      if (Array.isArray(arr)) {
        return arr
          .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
          .map((u) => u.trim());
      }
    } catch {
      /* legacy single-URL fallback */
    }
  }
  return [trimmed];
}

/** First public document link from Policy URL / URL fields on the policy record. */
export function extractPolicyDocumentUrl(policy: {
  policyUrl?: string | null;
  policyUrl2?: string | null;
}): string | null {
  const from2 = policy.policyUrl2?.trim();
  if (from2 && isHttpUrl(from2)) return from2;

  for (const u of parsePolicyUrls(policy.policyUrl)) {
    if (isHttpUrl(u)) return u;
    if (u.length > 0) return u;
  }
  return null;
}

/** All document links from the policy form (for email body text). */
export function listPolicyDocumentUrls(policy: {
  policyUrl?: string | null;
  policyUrl2?: string | null;
}): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const u of [...parsePolicyUrls(policy.policyUrl), policy.policyUrl2?.trim() ?? ""]) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    urls.push(u);
  }
  return urls;
}

function isHttpUrl(u: string): boolean {
  const l = u.toLowerCase();
  return l.startsWith("http://") || l.startsWith("https://");
}

/** Staff-only link to open the policy in SVKK (not the Policy URL document field). */
export function buildPolicyAppPageUrl(env: Env, policyId: string): string {
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

/** HTML snippet for email templates when a document link exists. */
export function policyDocumentLinkHtml(documentUrl: string | null, label = "Open policy document"): string {
  if (!documentUrl?.trim() || !isHttpUrl(documentUrl)) {
    return `<p class="muted">Your policy document link will be shared once it is uploaded in SVKK.</p>`;
  }
  const safe = documentUrl.replace(/"/g, "&quot;");
  return `<a class="btn" href="${safe}">${label}</a>`;
}

export function resolveNotificationLinks(
  env: Env,
  policy: { id: string; policyUrl?: string | null; policyUrl2?: string | null },
): {
  /** Policy URL field — use in emails to holders */
  policyDocumentUrl: string;
  /** All URLs from form */
  policyDocumentUrls: string[];
  /** In-app notification click target */
  staffLinkUrl: string;
  appPolicyUrl: string;
} {
  const policyDocumentUrls = listPolicyDocumentUrls(policy);
  const policyDocumentUrl = extractPolicyDocumentUrl(policy) ?? "";
  const appPolicyUrl = buildPolicyAppPageUrl(env, policy.id);
  const staffLinkUrl =
    policyDocumentUrl && isHttpUrl(policyDocumentUrl) ? policyDocumentUrl : appPolicyUrl;
  return { policyDocumentUrl, policyDocumentUrls, staffLinkUrl, appPolicyUrl };
}
