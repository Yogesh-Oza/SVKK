/**
 * Persists API tokens for split deployments (e.g. Vercel + Render) where
 * `SameSite=Lax` httpOnly cookies are not sent on cross-site XHR.
 * Prefer `COOKIE_SAME_SITE=none` on the API for true httpOnly; this is a fallback.
 * Tokens are in localStorage — mitigate XSS in the web app.
 */
const AT = "svkk_access_v1";
const RT = "svkk_refresh_v1";

function canStore(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getStoredAccessToken(): string | null {
  if (!canStore()) {
    return null;
  }
  return localStorage.getItem(AT);
}

export function getStoredRefreshToken(): string | null {
  if (!canStore()) {
    return null;
  }
  return localStorage.getItem(RT);
}

export function setStoredTokens(accessToken: string, refreshToken: string): void {
  if (!canStore()) {
    return;
  }
  try {
    localStorage.setItem(AT, accessToken);
    localStorage.setItem(RT, refreshToken);
  } catch {
    /* quota / private mode */
  }
}

export function setStoredAccessOnly(accessToken: string): void {
  if (!canStore()) {
    return;
  }
  try {
    localStorage.setItem(AT, accessToken);
  } catch {
    /* ignore */
  }
}

export function clearStoredTokens(): void {
  if (!canStore()) {
    return;
  }
  try {
    localStorage.removeItem(AT);
    localStorage.removeItem(RT);
  } catch {
    /* ignore */
  }
}
