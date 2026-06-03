import { AxiosError } from "axios";

type SvkkErrorBody = {
  code?: string;
  message?: string;
};

function readSvkkErrorBody(e: unknown): SvkkErrorBody | null {
  if (!(e instanceof AxiosError) || !e.response?.data || typeof e.response.data !== "object") {
    return null;
  }
  return e.response.data as SvkkErrorBody;
}

/**
 * API error code from SVKK JSON envelope (`{ code, message, traceId }`).
 */
export function getSvkkErrorCode(e: unknown): string | undefined {
  const code = readSvkkErrorBody(e)?.code;
  return typeof code === "string" && code.length > 0 ? code : undefined;
}

/**
 * Human-readable message from SVKK API error response.
 */
export function getSvkkErrorMessage(e: unknown, fallback: string): string {
  const msg = readSvkkErrorBody(e)?.message;
  if (msg) {
    return String(msg);
  }
  if (e instanceof Error && e.message) {
    return e.message;
  }
  return fallback;
}
