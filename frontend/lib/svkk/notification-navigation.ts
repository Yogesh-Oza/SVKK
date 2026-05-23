/** True when URL points at an SVKK policy page (any host), not an external document. */
export function isAppPolicyUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /\/policies\/[^/]+$/.test(u.pathname);
  } catch {
    return /\/policies\/[^/]+/.test(url);
  }
}

export function extractPolicyIdFromAppUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/policies\/([^/]+)$/);
    return m?.[1] ?? null;
  } catch {
    const m = url.match(/\/policies\/([^/?#]+)/);
    return m?.[1] ?? null;
  }
}

export type NotificationNavigation =
  | { kind: "internal"; path: string }
  | { kind: "external"; url: string };

/**
 * Prefer in-app policy routes over:policyId is known so clicks never open a stale localhost URL.
 * External document links (OneDrive, etc.) still open in a new tab.
 */
export function resolveNotificationNavigation(input: {
  linkUrl: string | null;
  policyId: string | null;
}): NotificationNavigation | null {
  const link = input.linkUrl?.trim() ?? "";
  const policyId = input.policyId?.trim() ?? "";

  if (link.startsWith("/")) {
    return { kind: "internal", path: link };
  }

  if (link.startsWith("http")) {
    if (isAppPolicyUrl(link)) {
      const id = extractPolicyIdFromAppUrl(link) ?? policyId;
      if (id) return { kind: "internal", path: `/policies/${id}` };
    }
    return { kind: "external", url: link };
  }

  if (policyId) {
    return { kind: "internal", path: `/policies/${policyId}` };
  }

  return null;
}
