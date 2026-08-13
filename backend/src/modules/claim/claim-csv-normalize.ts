import type { Prisma } from "@prisma/client";

const toUtc = (year: number, month: number, day: number): Date =>
  new Date(Date.UTC(year, month - 1, day));

/**
 * Parse flexible date strings and Excel serial numbers to UTC midnight.
 *
 * Separator/format conventions (order matters):
 *  - `yyyy-mm-dd`                      ISO
 *  - `dd-mm-yyyy` / `dd/mm/yyyy`       day-first (legacy TPA sheets)
 *  - `m/d/yy`                          month-first (field-software "Claim data 25-26", US style)
 *  - `dd-mm-yy`                        day-first, 2-digit year
 *  - anything else                     `Date.parse` fallback
 */
export function parseClaimDate(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;

  const serial = Number(t);
  if (Number.isFinite(serial) && serial > 20000 && serial < 100000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
    return epoch;
  }

  let m: RegExpExecArray | null;

  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) {
    return toUtc(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if ((m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(t))) {
    return toUtc(Number(m[3]), Number(m[2]), Number(m[1]));
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(t))) {
    return toUtc(2000 + Number(m[3]), Number(m[1]), Number(m[2]));
  }
  if ((m = /^(\d{1,2})-(\d{1,2})-(\d{2})$/.exec(t))) {
    return toUtc(2000 + Number(m[3]), Number(m[2]), Number(m[1]));
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

/**
 * Normalize Policy Number for claim→policy linking.
 * Trim, remove all whitespace, compare case-insensitively so "ABC 123" and "abc123" match.
 */
export function normalizePolicyNo(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

/** Normalize person names for fuzzy comparison. */
export function normalizePersonName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

const INSURER_STOP = new Set([
  "the",
  "a",
  "an",
  "co",
  "company",
  "ltd",
  "limited",
  "pvt",
  "private",
  "insurance",
  "assurance",
  "general",
  "inc",
  "corp",
  "corporation",
]);

/** Normalize insurer names so TPA legal names match the policy register. */
export function normalizeInsurerName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !INSURER_STOP.has(t))
    .join(" ");
}

/** Compare insurer names with suffix-stripping and containment. */
export function insurersMatch(csvName: string, dbName: string): boolean {
  const a = normalizeInsurerName(csvName);
  const b = normalizeInsurerName(dbName);
  if (!a || !b) return true;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  let overlap = 0;
  for (const tok of ta) {
    if (tb.has(tok)) overlap++;
  }
  const minSize = Math.min(ta.size, tb.size);
  return minSize > 0 && overlap >= minSize;
}

const HOLDER_STOP = new Set([
  "smt",
  "shri",
  "shree",
  "mrs",
  "mr",
  "ms",
  "miss",
  "kum",
  "kumari",
  "w",
  "o",
  "d",
  "wo",
  "do",
  "so",
]);

function holderNameTokens(raw: string): string[] {
  return normalizePersonName(raw)
    .split(" ")
    .filter((x) => x.length > 1 && !HOLDER_STOP.has(x));
}

/** Compare holder names with token overlap and joined-token tolerance (Kiranben / Kiran Ben). */
export function holderNamesMatch(csvName: string, dbName: string): boolean {
  const a = holderNameTokens(csvName).join(" ");
  const b = holderNameTokens(dbName).join(" ");
  if (!a || !b) return true;
  if (a === b) return true;
  const compactA = a.replace(/\s+/g, "");
  const compactB = b.replace(/\s+/g, "");
  if (compactA === compactB) return true;
  if (
    Math.min(compactA.length, compactB.length) >= 8 &&
    (compactA.includes(compactB) || compactB.includes(compactA))
  ) {
    return true;
  }
  const ta = new Set(a.split(" ").filter((x) => x.length > 1));
  const tb = new Set(b.split(" ").filter((x) => x.length > 1));
  if (ta.size === 0 || tb.size === 0) return compactA === compactB;
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
