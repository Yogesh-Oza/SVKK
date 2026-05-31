import type { Prisma } from "@prisma/client";

const DATE_PATTERNS = [
  /^(\d{4})-(\d{2})-(\d{2})$/,
  /^(\d{2})-(\d{2})-(\d{4})$/,
  /^(\d{2})\/(\d{2})\/(\d{4})$/,
  /^(\d{2})-(\d{2})-(\d{2})$/,
];

/** Parse flexible date strings and Excel serial numbers to UTC midnight. */
export function parseClaimDate(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;

  const serial = Number(t);
  if (Number.isFinite(serial) && serial > 20000 && serial < 100000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
    return epoch;
  }

  for (const re of DATE_PATTERNS) {
    const m = re.exec(t);
    if (!m) continue;
    if (re.source.startsWith("^(\\d{4})")) {
      return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
    if (m[3]!.length === 4) {
      return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    }
    const y = 2000 + Number(m[3]);
    return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  }

  const parsed = Date.parse(t);
  if (Number.isFinite(parsed)) {
    const d = new Date(parsed);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return null;
}

/** Compare two dates by UTC calendar day. */
export function datesEqualUtc(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Parse decimal currency / amount fields. */
export function parseClaimDecimal(raw: string): number | null {
  const cleaned = raw.trim().replace(/[,₹]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse Y/N, Yes/No, 1/0 to boolean. */
export function parseYesNo(raw: string): boolean | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (["y", "yes", "1", "true"].includes(t)) return true;
  if (["n", "no", "0", "false"].includes(t)) return false;
  return null;
}

/** Normalize person names for fuzzy comparison. */
export function normalizePersonName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Compare holder names with token overlap tolerance. */
export function holderNamesMatch(csvName: string, dbName: string): boolean {
  const a = normalizePersonName(csvName);
  const b = normalizePersonName(dbName);
  if (!a || !b) return true;
  if (a === b) return true;
  const ta = new Set(a.split(" ").filter((x) => x.length > 1));
  const tb = new Set(b.split(" ").filter((x) => x.length > 1));
  if (ta.size === 0 || tb.size === 0) return a === b;
  let overlap = 0;
  for (const tok of ta) {
    if (tb.has(tok)) overlap++;
  }
  const minSize = Math.min(ta.size, tb.size);
  return overlap >= minSize;
}

/** Compare sum insured within 2 decimal places. */
export function sumInsuredMatches(
  csvAmount: number | null,
  dbAmount: Prisma.Decimal | null | undefined,
): boolean {
  if (csvAmount == null && (dbAmount == null || dbAmount === undefined)) return true;
  if (csvAmount == null || dbAmount == null) return false;
  return Math.abs(Number(dbAmount.toString()) - csvAmount) < 0.01;
}

/** Parse integer age field. */
export function parseClaimAge(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Derive fiscal year label from a policy start date. */
export function yearLabelFromDate(d: Date | null): string {
  if (!d) return "UNKNOWN";
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (m >= 3) return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  return `${y - 1}-${String(y % 100).padStart(2, "0")}`;
}
