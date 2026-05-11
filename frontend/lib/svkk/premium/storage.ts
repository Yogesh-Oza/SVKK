import { svkkJson } from "@/lib/svkk/api";
import type {
  ChartBand,
  ChartData,
  DiscountConfig,
  PolicyDef,
  PremiumState,
} from "./types";

/** Key for the per-browser form state on the calculator page (policy choice,
 *  members, end date, etc.). Calculation source-of-truth lives on the server. */
export const STORAGE_KEY_FORM = "svkk_calc_form_v1";

/** Backend wire shape for the snapshot endpoint. */
export interface SnapshotPolicy {
  id?: string;
  key: string;
  name: string;
  description: string;
  mode: "same" | "different";
  discount: DiscountConfig | null;
  charts: {
    combined?: ChartBand[];
    holder?: ChartBand[];
    member?: ChartBand[];
  };
}

export interface PremiumSnapshot {
  policyTypes: SnapshotPolicy[];
}

const DEFAULT_DISCOUNT: DiscountConfig = {
  type: "count",
  different: "no",
  holder: "",
  member: "",
  daughter: "",
  byCount: { 1: 0, 2: 5, 3: 5, 4: 10, 5: 10, 6: 10, 7: 10 },
};

/** Server snapshot → PremiumState used by the calc engine. */
export function snapshotToState(snap: PremiumSnapshot): PremiumState {
  const defs: Record<string, PolicyDef> = {};
  const charts: Record<string, ChartData> = {};
  for (const p of snap.policyTypes) {
    defs[p.key] = {
      label: p.name,
      description: p.description ?? "",
      mode: p.mode,
      discount: p.discount ?? DEFAULT_DISCOUNT,
    };
    if (p.mode === "different") {
      charts[p.key] = {
        holder: p.charts.holder ?? [],
        member: p.charts.member ?? [],
      };
    } else {
      charts[p.key] = p.charts.combined ?? [];
    }
  }
  return { defs, charts };
}

/** PremiumState → server snapshot for the bulk save. */
export function stateToSnapshot(state: PremiumState): PremiumSnapshot {
  const policyTypes: SnapshotPolicy[] = Object.entries(state.defs).map(([key, def]) => {
    const chart = state.charts[key];
    const isDifferent = def.mode === "different";
    return {
      key,
      name: def.label,
      description: def.description ?? "",
      mode: def.mode,
      discount: def.discount,
      charts: isDifferent
        ? {
            holder: Array.isArray(chart) ? [] : chart?.holder ?? [],
            member: Array.isArray(chart) ? [] : chart?.member ?? [],
          }
        : {
            combined: Array.isArray(chart) ? chart : chart?.holder ?? [],
          },
    };
  });
  return { policyTypes };
}

/** Single GET that hydrates the whole calculator. */
export async function fetchPremiumSnapshot(): Promise<PremiumState> {
  const snap = await svkkJson<PremiumSnapshot>("/calculation/admin/snapshot");
  return snapshotToState(snap);
}

/** Single PUT that persists every edit from the admin panel. */
export async function savePremiumSnapshot(state: PremiumState): Promise<void> {
  await svkkJson<{ ok: true }>("/calculation/admin/snapshot", {
    method: "PUT",
    body: JSON.stringify(stateToSnapshot(state)),
  });
}

/** "  Senior Secure!! " → "senior_secure" */
export function normPolicyKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
