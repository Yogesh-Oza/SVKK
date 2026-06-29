import { svkkJson } from "@/lib/svkk/api";
import { getOfflineDb, getOrCreateMeta } from "./db";
import { expandDetail } from "./compress";
import type { OfflinePolicyListRow } from "./types";
import type { SvkkPolicyDetailForForm } from "@/features/svkk-policies/ad-policy-detail-to-form";
import { queueOfflineMutation, syncPendingMutations } from "./sync-engine";
import { nanoid } from "nanoid";
import { AxiosError } from "axios";
import {
  buildOfflineFiltersMeta,
  buildOfflinePolicyListPage,
  mapCachedRowsToGroupedList as groupCachedRows,
  type OfflineListFilters,
} from "./list-group-offline";
import { getCachedReferenceBundle } from "./offline-reference";
import { applyOfflineCreateToLocalCache, applyOfflineUpdateToLocalCache } from "./offline-local-cache";

export function isOfflineMode(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function isLikelyOfflineError(error: unknown): boolean {
  if (isOfflineMode()) return true;
  if (error instanceof AxiosError) {
    return !error.response && (error.code === "ERR_NETWORK" || /network/i.test(error.message));
  }
  return false;
}

export async function hasOfflineCache(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  try {
    const db = getOfflineDb();
    const count = await db.policies_list.count();
    return count > 0;
  } catch {
    return false;
  }
}

export async function getCachedPolicyList(): Promise<OfflinePolicyListRow[]> {
  const db = getOfflineDb();
  return db.policies_list.toArray();
}

export async function searchCachedPolicies(token: string): Promise<OfflinePolicyListRow[]> {
  const t = token.trim().toLowerCase();
  if (!t) return getCachedPolicyList();
  const db = getOfflineDb();
  const all = await db.policies_list.toArray();
  return all.filter(
    (r) =>
      r.svkkId.toLowerCase().includes(t) ||
      (r.policyNo?.toLowerCase().includes(t) ?? false) ||
      (r.holderName?.toLowerCase().includes(t) ?? false) ||
      (r.customerId?.toLowerCase().includes(t) ?? false) ||
      (r.mobile?.toLowerCase().includes(t) ?? false),
  );
}

export async function getCachedPolicyDetail(id: string): Promise<SvkkPolicyDetailForForm | null> {
  const db = getOfflineDb();
  const row = await db.policies_detail.get(id);
  if (!row) return null;
  return expandDetail(row);
}

export async function fetchPolicyDetail(id: string): Promise<SvkkPolicyDetailForForm> {
  if (isOfflineMode()) {
    const cached = await getCachedPolicyDetail(id);
    if (cached) return cached;
    throw new Error("Policy not available offline. Download policies for offline use first.");
  }
  try {
    return await svkkJson<SvkkPolicyDetailForForm>(`/policies/${id}`);
  } catch (e) {
    if (isLikelyOfflineError(e)) {
      const cached = await getCachedPolicyDetail(id);
      if (cached) return cached;
    }
    throw e;
  }
}

export async function fetchPolicyListForCarryForward(
  svkkId: string,
): Promise<OfflinePolicyListRow[]> {
  if (isOfflineMode()) {
    return searchCachedPolicies(svkkId);
  }
  try {
    const search = new URLSearchParams({
      search: svkkId.trim(),
      groupBySvkk: "false",
      pageSize: "50",
    });
    const res = await svkkJson<{ items: Array<Record<string, unknown>> }>(`/policies?${search}`);
    const { compressListRow } = await import("./compress");
    return (res.items ?? []).map((r) => compressListRow(r as Parameters<typeof compressListRow>[0]));
  } catch (e) {
    if (isLikelyOfflineError(e)) {
      return searchCachedPolicies(svkkId);
    }
    throw e;
  }
}

export async function submitPolicyCreateOffline(
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ id: string; offline: boolean }> {
  if (!isOfflineMode()) {
    const { apiPost } = await import("@/lib/svkk/api");
    const res = await apiPost<Record<string, unknown>>("/policies", body, {
      headers: { "Idempotency-Key": idempotencyKey },
    });
    const id = typeof res.id === "string" ? res.id : "";
    return { id, offline: false };
  }

  const clientTempId = nanoid();
  await queueOfflineMutation({
    id: nanoid(),
    kind: "create",
    clientTempId,
    payload: body,
    idempotencyKey,
  });
  await applyOfflineCreateToLocalCache(clientTempId, body);
  return { id: clientTempId, offline: true };
}

export async function submitPolicyUpdateOffline(
  policyId: string,
  body: Record<string, unknown>,
  expectedUpdatedAt: string,
): Promise<{ offline: boolean }> {
  await queueOfflineMutation({
    id: nanoid(),
    kind: "update",
    policyId,
    clientTempId: policyId,
    payload: { ...body, expectedUpdatedAt },
    expectedUpdatedAt,
  });
  await applyOfflineUpdateToLocalCache(policyId, body);
  return { offline: true };
}

export function mapCachedRowsToGroupedList(rows: OfflinePolicyListRow[]) {
  return groupCachedRows(rows);
}

export async function loadOfflinePolicyListPage(input: {
  search?: string;
  filters?: OfflineListFilters;
  sort?: string;
  page?: number;
  pageSize?: number;
}) {
  const rows = input.search?.trim()
    ? await searchCachedPolicies(input.search)
    : await getCachedPolicyList();
  return buildOfflinePolicyListPage({
    rows,
    filters: input.filters,
    sort: input.sort,
    page: input.page,
    pageSize: input.pageSize,
  });
}

export async function getOfflineCategories(): Promise<
  Array<{ id: string; key: string; name: string }>
> {
  const ref = await getCachedReferenceBundle();
  if (!ref?.categories?.length) return [];
  return ref.categories.map((c) => ({
    id: c.id,
    key: c.value?.trim() || c.label?.trim() || "",
    name: c.label?.trim() || c.value?.trim() || "",
  }));
}

export async function getOfflineFiltersMeta() {
  const rows = await getCachedPolicyList();
  return buildOfflineFiltersMeta(rows);
}

export type { OfflineListFilters };

export async function fetchPolicyListRowsForForm(
  search: string,
): Promise<
  Array<{
    id: string;
    periodYearText?: string | null;
    insuredParty: {
      svkkPublicId: string;
      name: string;
      customerId: string | null;
    };
    years: Array<{ yearLabel: string }>;
  }>
> {
  const fromCache = async () => {
    const rows = await searchCachedPolicies(search);
    return rows.map((r) => ({
      id: r.id,
      periodYearText: r.yearLabel,
      insuredParty: {
        svkkPublicId: r.svkkId,
        name: r.holderName ?? "",
        customerId: r.customerId,
      },
      years: [{ yearLabel: r.yearLabel }],
    }));
  };

  if (isOfflineMode()) {
    return fromCache();
  }
  try {
    const params = new URLSearchParams({
      search: search.trim(),
      page: "1",
      pageSize: "50",
      sort: "createdAt",
      groupBySvkk: "false",
    });
    const res = await svkkJson<{
      items: Array<{
        id: string;
        periodYearText?: string | null;
        insuredParty: { svkkPublicId: string; name: string; customerId: string | null };
        years: Array<{ yearLabel: string }>;
      }>;
    }>(`/policies?${params}`);
    return res.items ?? [];
  } catch (e) {
    if (isLikelyOfflineError(e)) {
      return fromCache();
    }
    throw e;
  }
}

export async function getOfflineMetaSummary() {
  return getOrCreateMeta();
}

export async function refreshDeltaIfOnline(): Promise<void> {
  const { syncPoliciesCacheInBackground } = await import("./background-policy-cache");
  await syncPoliciesCacheInBackground("periodic");
}

export async function getPendingMutationCounts(): Promise<{
  /** Waiting to upload or currently uploading */
  pending: number;
  /** Upload attempted but rejected by server / network */
  failed: number;
  conflicts: number;
}> {
  const db = getOfflineDb();
  const pending = await db.mutations.where("status").anyOf(["pending", "syncing"]).count();
  const failed = await db.mutations.where("status").equals("failed").count();
  const conflicts = await db.mutations.where("status").equals("conflict").count();
  return { pending, failed, conflicts };
}

export function isPremiumSnapshotStale(days: number): Promise<boolean> {
  return getOrCreateMeta().then((m) => {
    if (!m.premiumSnapshotDate) return true;
    const age = Date.now() - new Date(m.premiumSnapshotDate).getTime();
    return age > days * 24 * 60 * 60 * 1000;
  });
}
