const TOKEN_KEY = "svkk_access_token";

let memoryToken: string | null = null;

export function getSvkkAccessToken(): string | null {
  if (typeof window === "undefined") {
    return memoryToken;
  }
  return memoryToken ?? sessionStorage.getItem(TOKEN_KEY);
}

export function setSvkkAccessToken(token: string | null): void {
  memoryToken = token;
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}
