import { csvCell } from "./policy-csv-utils.js";

export type CsvRowError = {
  row: number;
  error: string;
  svkkId?: string;
  policyNo?: string;
  refNo?: string;
};

/** Build downloadable error report CSV content. */
export function buildErrorReportCsv(errors: CsvRowError[]): string {
  const lines = ["Row,Error,SVKK ID,Policy No,Ref No"];
  for (const e of errors) {
    lines.push(
      [
        String(e.row),
        e.error,
        e.svkkId ?? "",
        e.policyNo ?? "",
        e.refNo ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Parse `row N: message` from legacy error strings. */
export function parseRowErrorString(raw: string): { row: number; message: string } | null {
  const m = /^row (\d+): (.+)$/.exec(raw.trim());
  if (!m) return null;
  return { row: Number.parseInt(m[1]!, 10), message: m[2]! };
}
