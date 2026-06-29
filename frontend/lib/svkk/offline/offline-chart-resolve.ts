import { apiGet } from "@/lib/svkk/api";
import { AxiosError } from "axios";
import { getCachedReferenceBundle } from "./offline-reference";
import type { PolicyChartRef } from "./types";

export type { PolicyChartRef };

function isLikelyOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (error instanceof AxiosError) {
    return !error.response && (error.code === "ERR_NETWORK" || /network/i.test(error.message));
  }
  return false;
}

export function pickDefaultPolicyChartId(charts: PolicyChartRef[]): string | null {
  if (!charts.length) return null;
  const combined = charts.find((c) => c.chartKind === "COMBINED");
  if (combined) return combined.id;
  const holder = charts.find((c) => c.chartKind === "HOLDER");
  return holder?.id ?? charts[0]?.id ?? null;
}

async function chartsFromCache(policyTypeId: string): Promise<PolicyChartRef[]> {
  const ref = await getCachedReferenceBundle();
  return ref?.policyChartsByTypeId?.[policyTypeId] ?? [];
}

export async function fetchChartsForPolicyType(policyTypeId: string): Promise<PolicyChartRef[]> {
  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      return await apiGet<PolicyChartRef[]>(
        `/calculation/reference/charts?policyTypeId=${encodeURIComponent(policyTypeId)}`,
      );
    } catch (e) {
      if (!isLikelyOfflineError(e)) throw e;
    }
  }
  return chartsFromCache(policyTypeId);
}

export async function repairCreatePayloadChart(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const policyTypeId = typeof payload.policyTypeId === "string" ? payload.policyTypeId.trim() : "";
  if (!policyTypeId) return payload;

  const charts = await fetchChartsForPolicyType(policyTypeId);
  if (!charts.length) return payload;

  const currentId =
    typeof payload.policyChartId === "string" ? payload.policyChartId.trim() : "";
  if (currentId && charts.some((c) => c.id === currentId)) {
    return payload;
  }

  const chartId = pickDefaultPolicyChartId(charts);
  return chartId ? { ...payload, policyChartId: chartId } : payload;
}
