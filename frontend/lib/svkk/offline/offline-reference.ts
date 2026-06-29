import {
  fetchPremiumSnapshot,
  snapshotToState,
  stateToSnapshot,
  type PremiumState,
} from "@/lib/svkk/premium";
import { getOfflineDb, updateMeta } from "./db";
import type { OfflineReferenceBundle } from "./types";
import { PREMIUM_STALE_BLOCK_DAYS } from "./types";

function isOfflineMode(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export async function getCachedReferenceBundle(): Promise<OfflineReferenceBundle | null> {
  try {
    const db = getOfflineDb();
    const row = await db.reference.get("main");
    if (!row) return null;
    const { key: _key, ...rest } = row;
    return rest as OfflineReferenceBundle;
  } catch {
    return null;
  }
}

/** Write latest premium charts from server into IndexedDB reference store. */
export async function persistPremiumSnapshotToCache(
  state: PremiumState,
  opts?: { version?: string; snapshotDate?: string },
): Promise<void> {
  const db = getOfflineDb();
  const existing = await getCachedReferenceBundle();
  const premiumSnapshot = stateToSnapshot(state);
  const premiumSnapshotDate = opts?.snapshotDate ?? new Date().toISOString();
  const premiumSnapshotVersion = opts?.version ?? existing?.premiumSnapshotVersion ?? "0";

  await db.reference.put({
    key: "main",
    dropdowns: existing?.dropdowns ?? {},
    categories: existing?.categories ?? [],
    policyTypes: existing?.policyTypes ?? [],
    policyGroupings: existing?.policyGroupings ?? [],
    policyChartsByTypeId: existing?.policyChartsByTypeId ?? {},
    premiumSnapshot,
    premiumSnapshotVersion,
    premiumSnapshotDate,
  });

  await updateMeta({
    premiumSnapshotDate,
    premiumSnapshotVersion,
  });
}

/** Fetch premium from API when online and persist to IDB; read IDB when offline. */
export async function fetchPremiumSnapshotWithOffline(): Promise<PremiumState | null> {
  if (isOfflineMode()) {
    const ref = await getCachedReferenceBundle();
    if (!ref?.premiumSnapshot?.policyTypes?.length) return null;
    return snapshotToState(ref.premiumSnapshot);
  }

  const state = await fetchPremiumSnapshot();
  await persistPremiumSnapshotToCache(state);
  return state;
}

/** @deprecated Use fetchPremiumSnapshotWithOffline */
export const fetchPremiumSnapshotForForm = fetchPremiumSnapshotWithOffline;

/** Lightweight refresh — premium charts only, no full policy bundle. */
export async function refreshPremiumSnapshotFromServer(): Promise<PremiumState | null> {
  if (isOfflineMode()) return null;
  try {
    const state = await fetchPremiumSnapshot();
    await persistPremiumSnapshotToCache(state);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("svkk-premium-synced"));
    }
    return state;
  } catch {
    return null;
  }
}

/** Block auto-calc only when offline and cached rates are missing or very stale. */
export async function isPremiumAutoCalcBlocked(): Promise<boolean> {
  if (!isOfflineMode()) return false;

  const ref = await getCachedReferenceBundle();
  if (!ref?.premiumSnapshot?.policyTypes?.length) return true;
  if (!ref.premiumSnapshotDate) return true;

  const age = Date.now() - new Date(ref.premiumSnapshotDate).getTime();
  return age > PREMIUM_STALE_BLOCK_DAYS * 24 * 60 * 60 * 1000;
}

export async function referenceBundleToDropdownState(
  ref: OfflineReferenceBundle,
): Promise<import("@/lib/svkk/use-dropdown-options").DropdownOptionsState> {
  const { emptyDropdownOptionsMap, DROPDOWN_TYPES } = await import("@/lib/svkk/dropdown-options");
  const map: import("@/lib/svkk/use-dropdown-options").DropdownOptionsState = {
    ...emptyDropdownOptionsMap(),
    categories: [],
    policyTypes: [],
    policyGroupings: [],
  };
  for (const t of DROPDOWN_TYPES) {
    map[t] = ref.dropdowns[t] ?? [];
  }
  map.categories = ref.categories ?? [];
  map.policyTypes = ref.policyTypes ?? [];
  map.policyGroupings = (ref.policyGroupings ?? []).map((name) => ({ value: name, label: name }));
  return map;
}
