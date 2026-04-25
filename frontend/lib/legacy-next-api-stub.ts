/**
 * The old shadcn CRM used Next.js route handlers under `/api/*`. Those are removed;
 * the SVKK mediclaim app talks to the Express API via `lib/svkk/api.ts` only.
 * This helper returns empty (or safe) JSON so sample CRM pages keep rendering.
 */
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubForPathname(pathname: string, search: string): object {
  if (pathname === "/api/me") {
    return { role: "sales", name: "", email: "" };
  }
  if (pathname === "/api/users") {
    return { users: [] };
  }
  if (pathname === "/api/notification-preferences") {
    return { email: { enabled: true }, whatsapp: { enabled: false } };
  }
  if (pathname === "/api/notifications") {
    return { notifications: [] };
  }
  if (pathname === "/api/alerts") {
    return { alerts: [] };
  }
  if (pathname === "/api/analytics/sales-performance") {
    return { rows: [] };
  }
  if (pathname === "/api/calendar/events") {
    return { events: [] };
  }
  if (pathname.startsWith("/api/leads")) {
    if (pathname.includes("/reassign") || pathname.includes("/stage")) {
      return { ok: true };
    }
    if (pathname !== "/api/leads" && /^\/api\/leads\/[^/]+$/.test(pathname)) {
      const id = pathname.split("/").pop() ?? "unknown";
      return {
        id,
        name: "Demo lead (no CRM API on SVKK backend)",
        phone: "—",
        source: "manual",
        stage: "new",
        assignedUserId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stageHistory: [],
        assignedUser: null,
        aiSummary: null,
        aiScore: null,
      };
    }
    const params = new URLSearchParams(search);
    return { leads: [], total: 0, page: Number(params.get("page") ?? 1) };
  }
  if (pathname.startsWith("/api/follow-ups")) {
    if (pathname.includes("/complete")) {
      return { ok: true };
    }
    return { followUps: [] };
  }
  if (pathname.startsWith("/api/chats")) {
    if (pathname.endsWith("/send")) {
      return { ok: true, message: null };
    }
    return { messages: [] };
  }
  if (pathname.startsWith("/api/ai/")) {
    return { text: "", score: 0, suggestions: [] };
  }
  if (pathname.startsWith("/api/analytics/")) {
    return { series: [], points: [] };
  }
  if (pathname.startsWith("/api/auth/password-reset")) {
    return { error: "Password reset is not enabled for the SVKK deployment." };
  }
  return { ok: true };
}

/**
 * Use instead of `fetch("/api/...")` in legacy CRM components.
 */
export async function legacyNextApiFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string" ? new URL(input, "http://localhost") : new URL(String(input));
  if (url.pathname.startsWith("/api/")) {
    return json(stubForPathname(url.pathname, url.search));
  }
  return fetch(input, init);
}
