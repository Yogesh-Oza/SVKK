import type { PolicyChart } from "@prisma/client";
import type { PremiumMatrixJson } from "./premium.types.js";

const cache = new Map<string, PremiumMatrixJson>();
const TTL_MS = 5 * 60 * 1000;
const expiry = new Map<string, number>();

function keyForChart(chart: PolicyChart): string {
  return chart.id;
}

export function getCachedMatrix(chart: PolicyChart): PremiumMatrixJson {
  const k = keyForChart(chart);
  const now = Date.now();
  if (cache.has(k) && (expiry.get(k) ?? 0) > now) {
    return cache.get(k)!;
  }
  const parsed = chart.premiumMatrix as unknown as PremiumMatrixJson;
  cache.set(k, parsed);
  expiry.set(k, now + TTL_MS);
  return parsed;
}

export function invalidateChartCache(chartId: string) {
  cache.delete(chartId);
  expiry.delete(chartId);
}
