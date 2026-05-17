/**
 * Safe parser for legacy DATE/DATETIME columns (incl. 0000-00-00).
 */

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

export function parseLegacyDate(raw: string | Date | null | undefined): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    const y = raw.getUTCFullYear();
    const m = raw.getUTCMonth() + 1;
    const d = raw.getUTCDate();
    if (!isValidYmd(y, m, d)) return null;
    return new Date(Date.UTC(y, m - 1, d));
  }
  const s = String(raw).trim();
  if (!s || s.startsWith("0000-00")) return null;
  const m = DATE_PREFIX.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!isValidYmd(y, mo, d)) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

function isValidYmd(y: number, mo: number, d: number): boolean {
  if (y < 1900 || y > 2100) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

/** First token from corrupted cheque_status defaults. */
export function parseLegacyChequeStatusToken(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = String(raw)
    .replace(/'/g, "")
    .replace(/,/g, " ")
    .trim();
  const token = cleaned.split(/\s+/).find((t) => t.length > 0);
  if (!token) return null;
  return token.toUpperCase();
}
