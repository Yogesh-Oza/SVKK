import { nanoid } from "nanoid";

/** Prefix for client-only SVKK IDs shown while offline (replaced on server sync). */
export const OFFLINE_TEMP_SVKK_PREFIX = "TEMP-";

/** Legacy offline placeholder pattern: {GROUP}{MON}0000 — collides on sync if sent to server. */
const LEGACY_PLACEHOLDER_SVKK = /^[A-Z0-9]+[A-Z]{3}0000$/;

/** Generate a unique temporary SVKK ID for offline new-holder policies. */
export function generateOfflineTempSvkkPublicId(): string {
  const suffix = nanoid(8).toUpperCase().replace(/[^A-Z0-9]/g, "0");
  return `${OFFLINE_TEMP_SVKK_PREFIX}${suffix}`;
}

/** True when the ID is offline-only and must not be sent to the server on create sync. */
export function isProvisionalSvkkPublicId(svkkPublicId: string | null | undefined): boolean {
  const id = svkkPublicId?.trim().toUpperCase() ?? "";
  if (!id) return false;
  if (id.startsWith(OFFLINE_TEMP_SVKK_PREFIX)) return true;
  return LEGACY_PLACEHOLDER_SVKK.test(id);
}

/**
 * Prepare a queued offline create payload for POST /policies.
 * Strips provisional SVKK IDs so the server allocates the real one.
 */
export function prepareOfflineCreatePayloadForSync(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...payload };
  delete out._offlineProvisionalSvkkId;

  const svkk =
    typeof out.svkkPublicId === "string"
      ? out.svkkPublicId.trim()
      : typeof out.svkkPublicId === "number"
        ? String(out.svkkPublicId)
        : "";

  if (isProvisionalSvkkPublicId(svkk)) {
    delete out.svkkPublicId;
  }

  return out;
}
