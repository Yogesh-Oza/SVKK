import { clearStoredTokens } from "@/lib/svkk/token-storage";

type SessionInvalidationHandler = (message: string) => void;

let handler: SessionInvalidationHandler | null = null;

/** Register from `SvkkAuthProvider` to clear Redux and redirect to login. */
export function registerSessionInvalidationHandler(fn: SessionInvalidationHandler): () => void {
  handler = fn;
  return () => {
    if (handler === fn) {
      handler = null;
    }
  };
}

/** Clears stored tokens and notifies the auth layer (toast + redirect). */
export function invalidateSession(message: string): void {
  clearStoredTokens();
  handler?.(message);
}
