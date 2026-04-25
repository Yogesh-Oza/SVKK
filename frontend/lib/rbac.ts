export type UserRole = "admin" | "sales";

export interface SessionWithRole {
  user: { id: string; name: string; email: string; image?: string | null };
  role: UserRole;
}

/**
 * No server session with SVKK httpOnly-on-API auth. Use client Redux or `GET` `/auth/me` from the browser.
 */
export async function getSessionWithRole(): Promise<SessionWithRole | null> {
  return null;
}

export function requireAuth(
  session: SessionWithRole | null,
): asserts session is SessionWithRole {
  if (!session) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export function requireAdmin(session: SessionWithRole): void {
  if (session.role !== "admin") {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export function canAccessLead(
  session: SessionWithRole,
  lead: { assignedUserId?: string | null },
): boolean {
  if (session.role === "admin") return true;
  return lead.assignedUserId === session.user.id;
}
