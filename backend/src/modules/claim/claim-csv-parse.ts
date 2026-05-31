import ExcelJS from "exceljs";
import { parseCsv, parseCsvLine } from "../policy/policy-csv-parse.js";
import { canonicalClaimHeader } from "./claim-csv-format.js";

export type ParsedClaimSheet = {
  header: string[];
  dataRows: string[][];
};

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text.trim();
  }
  if (typeof value === "object" && "result" in value) {
    return cellToString(value.result as ExcelJS.CellValue);
  }
  return String(value).trim();
}

/** Parse first worksheet from an XLSX buffer. */
async function parseXlsxBuffer(buffer: Buffer): Promise<ParsedClaimSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { header: [], dataRows: [] };
  }

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (cells.length < colNumber - 1) cells.push("");
      cells.push(cellToString(cell.value));
    });
    if (cells.some((c) => c.trim())) rows.push(cells);
  });

  if (!rows.length) return { header: [], dataRows: [] };
  const header = rows[0]!.map(canonicalClaimHeader);
  return { header, dataRows: rows.slice(1) };
}

/** Detect file type and parse claim CSV or XLSX into header + data rows. */
export async function parseClaimFile(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedClaimSheet> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return parseXlsxBuffer(buffer);
  }

  const text = buffer.toString("utf8");
  const allRows = parseCsv(text);
  if (!allRows.length) return { header: [], dataRows: [] };
  const header = allRows[0]!.map(canonicalClaimHeader);
  return { header, dataRows: allRows.slice(1) };
}

/** Build header-index map for a row. */
export function claimRowToMap(header: string[], row: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < header.length; i++) {
    const key = header[i]?.trim() ?? "";
    if (!key) continue;
    map.set(key, row[i] ?? "");
  }
  return map;
}

export function getClaimField(map: Map<string, string>, ...names: string[]): string {
  for (const name of names) {
    const direct = map.get(name);
    if (direct !== undefined) return direct.trim();
    const lower = name.toLowerCase();
    for (const [k, v] of map) {
      if (k.trim().toLowerCase() === lower) return v.trim();
    }
  }
  return "";
}

/** Split a single CSV line for error report round-trips. */
export { parseCsvLine };
