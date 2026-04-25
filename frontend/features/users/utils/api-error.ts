import { AxiosError } from "axios";

/**
 * Pulls a readable message from an SVKK API error response (`{ code, message }`).
 */
export function getSvkkErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof AxiosError && e.response?.data && typeof e.response.data === "object") {
    const msg = (e.response.data as { message?: string }).message;
    if (msg) {
      return String(msg);
    }
  }
  if (e instanceof Error && e.message) {
    return e.message;
  }
  return fallback;
}
