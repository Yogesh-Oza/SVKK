import type { CsvRowObject } from "./future-premium-types";

const STORAGE_KEY = "svkk_future_premium_rows";

export function loadUploadedFutureRows(): CsvRowObject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CsvRowObject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUploadedFutureRows(rows: CsvRowObject[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    /* quota / private mode */
  }
}
