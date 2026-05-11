import { SAMPLE_CHARTS, SAMPLE_DEFS } from "./sample-data";
import type { ChartData, PolicyDef, PremiumState } from "./types";

export const STORAGE_KEY_FORM = "svkk_calc_form_v1";
export const STORAGE_KEY_DEFS = "svkk_calc_defs_v1";
export const STORAGE_KEY_CHARTS = "svkk_calc_charts_v1";

function safeJson<T>(raw: string | null, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readKey<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return safeJson<T>(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

function writeKey(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

/**
 * Load the persisted defs/charts from localStorage, falling back to the
 * bundled samples. Both halves are merged: a partial override doesn't wipe
 * the built-in policies.
 */
export function loadPremiumState(): PremiumState {
  const defs = readKey<Record<string, PolicyDef> | null>(STORAGE_KEY_DEFS, null);
  const charts = readKey<Record<string, ChartData> | null>(STORAGE_KEY_CHARTS, null);
  return {
    defs: { ...SAMPLE_DEFS, ...(defs ?? {}) },
    charts: { ...SAMPLE_CHARTS, ...(charts ?? {}) },
  };
}

export function savePremiumDefs(defs: Record<string, PolicyDef>) {
  writeKey(STORAGE_KEY_DEFS, defs);
}

export function savePremiumCharts(charts: Record<string, ChartData>) {
  writeKey(STORAGE_KEY_CHARTS, charts);
}

/** "  Senior Secure!! " → "senior_secure" */
export function normPolicyKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
