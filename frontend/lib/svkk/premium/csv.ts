import type { ChartBand } from "./types";

/** Minimal CSV parser matching the reference HTML behaviour (handles quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Coerce currency-ish strings to a finite number; returns NaN on failure. */
export function money(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return NaN;
  const cleaned = String(v).replace(/[^\d.\-]/g, "");
  return cleaned ? Number(cleaned) : NaN;
}

/**
 * Convert a CSV grid into chart bands. The first column must contain the age
 * group ("0-17", "18-35", or a single age "30"), and subsequent columns are
 * sum insured values. Throws if it can't find the header or any band row.
 */
export function parseChartRows(rows: string[][]): ChartBand[] {
  const headIndex = rows.findIndex((r) =>
    r.some((c) => String(c || "").toLowerCase().includes("age")),
  );
  if (headIndex < 0) throw new Error("Header row with Age / Age Group not found");
  const head = rows[headIndex]!;
  const sis = head
    .slice(1)
    .map((v) => money(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!sis.length) throw new Error("No sum insured values found in header row");

  const out: ChartBand[] = [];
  for (let i = headIndex + 1; i < rows.length; i++) {
    const ageText = String(rows[i]![0] || "")
      .trim()
      .replace(/to/gi, "-")
      .replace(/–/g, "-");
    if (!ageText) continue;
    let min: number, max: number;
    const m = ageText.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      min = Number(m[1]);
      max = Number(m[2]);
    } else if (/^\d+$/.test(ageText)) {
      min = Number(ageText);
      max = Number(ageText);
    } else {
      continue;
    }
    const premiums: Record<string, number> = {};
    sis.forEach((si, idx) => {
      const p = money(rows[i]![idx + 1]);
      if (Number.isFinite(p) && p > 0) premiums[String(si)] = p;
    });
    if (Object.keys(premiums).length) {
      out.push({ label: min === max ? String(min) : `${min}-${max}`, min, max, premiums });
    }
  }
  if (!out.length) throw new Error("No premium rows found");
  return out;
}

/** Convenience: read a `File` and return its parsed bands. */
export async function fileToChartRows(file: File): Promise<ChartBand[]> {
  const text = await file.text();
  return parseChartRows(parseCsv(text));
}
