const LEGACY_TOKEN_KEY = "svkk_access_token";
const LEGACY_USER_KEY = "svkk_user";

let memoryToken: string | null = null;

if (typeof window !== "undefined") {
  try {
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
    sessionStorage.removeItem(LEGACY_USER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * In-memory only — avoids XSS exfiltration via `sessionStorage` / `localStorage`.
 * Survive tab reload via `POST /auth/refresh` (httpOnly `refreshToken` cookie).
 */
export function getSvkkAccessToken(): string | null {
  return memoryToken;
}

export function setSvkkAccessToken(token: string | null): void {
  memoryToken = token;
}
