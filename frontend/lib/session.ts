/**
 * Legacy shims. Auth is client-side (Redux) + SVKK httpOnly cookies; see `dashboard-client-layout.tsx`.
 */
export async function getServerSession(): Promise<null> {
  return null;
}

export async function isAuthenticated(): Promise<boolean> {
  return false;
}

export { getSessionWithRole } from "./rbac";
