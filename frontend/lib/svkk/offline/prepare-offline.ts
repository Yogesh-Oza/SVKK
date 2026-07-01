import { svkkJson } from "@/lib/svkk/api";
import { getOfflineDb, updateMeta } from "./db";
import { compressDetail, compressListRow } from "./compress";
import { logOfflineEvent } from "./analytics-log";
import { warmPolicyAppShellCache } from "./warm-offline-shell";
import type { OfflineBundleResponse } from "./types";
import {
  OFFLINE_BATCH_SIZE,
  OFFLINE_DEFAULT_LIMIT,
  OFFLINE_FISCAL_YEARS,
  QUOTA_BLOCK_RATIO,
  QUOTA_WARN_RATIO,
} from "./types";

export type DownloadProgress = {
  phase: "list" | "details" | "reference" | "done";
  current: number;
  total: number;
  message: string;
};

export type DownloadOfflineOptions = {
  /** Fiscal year label start (inclusive), e.g. "2024-25" */
  yearFrom?: string;
  limit?: number;
  offset?: number;
  /** Download every in-scope policy (all years), paginated on server. */
  allYears?: boolean;
  /** Delta mode — only changes since last sync */
  updatedAfter?: string;
  /** Append to existing cache (Download More) */
  append?: boolean;
  onProgress?: (p: DownloadProgress) => void;
};

export type DownloadAllResult = {
  totalCached: number;
  totalAvailable: number;
};

function currentFiscalYearStart(): number {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return month >= 3 ? year : year - 1;
}

export function defaultYearFromLabel(): string {
  const start = currentFiscalYearStart() - (OFFLINE_FISCAL_YEARS - 1);
  const end = start + 1;
  const endShort = String(end).slice(-2);
  return `${start}-${endShort}`;
}

export async function estimateStorageQuota(): Promise<{
  usage: number;
  quota: number;
  ratio: number;
}> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0, ratio: 0 };
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const ratio = quota > 0 ? usage / quota : 0;
  await updateMeta({ lastQuotaRatio: ratio });
  if (ratio >= QUOTA_WARN_RATIO) {
    await logOfflineEvent("quota_warning", { usageRatio: ratio });
  }
  return { usage, quota, ratio };
}

export async function isDownloadBlockedByQuota(): Promise<boolean> {
  const { ratio } = await estimateStorageQuota();
  return ratio >= QUOTA_BLOCK_RATIO;
}

function buildBundleQuery(opts: DownloadOfflineOptions): string {
  const params = new URLSearchParams();
  params.set("includeDetails", "true");
  params.set("limit", String(opts.limit ?? OFFLINE_DEFAULT_LIMIT));
  if (opts.offset != null && opts.offset > 0) {
    params.set("offset", String(opts.offset));
  }
  if (opts.allYears) {
    params.set("allYears", "true");
  } else if (opts.updatedAfter) {
    params.set("updatedAfter", opts.updatedAfter);
  } else if (opts.yearFrom) {
    params.set("yearFrom", opts.yearFrom);
  } else {
    params.set("yearFrom", defaultYearFromLabel());
  }
  if (opts.append && opts.yearFrom) {
    params.set("offsetYearBefore", opts.yearFrom);
  }
  return params.toString();
}

/** Remove cached policies only — keeps mutations, reference, auth. */
export async function clearPolicyCachesOnly(): Promise<void> {
  const db = getOfflineDb();
  await db.policies_list.clear();
  await db.policies_detail.clear();
}

async function fetchOfflineBundle(opts: DownloadOfflineOptions): Promise<OfflineBundleResponse> {
  const query = buildBundleQuery(opts);
  return svkkJson<OfflineBundleResponse>(`/policies/offline-bundle?${query}`);
}

async function mergeBundleIntoDb(
  bundle: OfflineBundleResponse,
  opts?: { persistReference?: boolean },
): Promise<number> {
  const db = getOfflineDb();

  if (bundle.deletedPolicyIds?.length) {
    await db.policies_list.bulkDelete(bundle.deletedPolicyIds);
    await db.policies_detail.bulkDelete(bundle.deletedPolicyIds);
  }

  const listRows = bundle.policies.map(compressListRow);
  const details = (bundle.details ?? []).map((d) =>
    compressDetail(d as unknown as Record<string, unknown>),
  );

  if (listRows.length) {
    await db.policies_list.bulkPut(listRows);
  }
  if (details.length) {
    await db.policies_detail.bulkPut(details);
  }

  if (opts?.persistReference !== false && bundle.reference) {
    await db.reference.put({ key: "main", ...bundle.reference });
  }

  return listRows.length;
}

export async function downloadPoliciesForOffline(
  opts: DownloadOfflineOptions = {},
): Promise<OfflineBundleResponse> {
  if (await isDownloadBlockedByQuota()) {
    throw new Error("Storage almost full. Clear offline data or download fewer policies.");
  }

  opts.onProgress?.({
    phase: "list",
    current: 0,
    total: 1,
    message: "Fetching offline bundle…",
  });

  try {
    const bundle = await fetchOfflineBundle(opts);

    opts.onProgress?.({
      phase: "details",
      current: 0,
      total: bundle.details?.length ?? bundle.policies.length,
      message: "Saving to device…",
    });

    const saved = await mergeBundleIntoDb(bundle);

    const db = getOfflineDb();
    const totalCached = await db.policies_list.count();

    await updateMeta({
      lastSyncAt: bundle.meta.syncedAt,
      lastSyncPolicyCount: totalCached,
      scopePolicyTotal: bundle.meta.totalAvailable ?? null,
      premiumSnapshotDate: bundle.reference?.premiumSnapshotDate ?? null,
      premiumSnapshotVersion: bundle.reference?.premiumSnapshotVersion ?? null,
      scopeHash: bundle.meta.scopeHash,
      downloadCursor: opts.yearFrom ?? null,
    });

    opts.onProgress?.({
      phase: "done",
      current: saved,
      total: saved,
      message: "Download complete",
    });

    void warmPolicyAppShellCache();

    return bundle;
  } catch (e) {
    throw e;
  }
}

/**
 * Download every policy in the user's scope (all years, full detail) in batches.
 * Replaces the local policy cache when complete.
 */
export async function downloadAllPoliciesForOffline(opts?: {
  onProgress?: (p: DownloadProgress) => void;
}): Promise<DownloadAllResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("Connect to the internet to download all policies.");
  }
  if (await isDownloadBlockedByQuota()) {
    throw new Error("Storage almost full. Clear offline data before downloading all policies.");
  }

  await clearPolicyCachesOnly();

  let offset = 0;
  let totalCached = 0;
  let totalAvailable = 0;
  let lastSyncedAt: string | null = null;
  let scopeHash: string | null = null;

  try {
    while (true) {
      if (await isDownloadBlockedByQuota()) {
        throw new Error("Storage almost full. Download stopped partway — free space and retry.");
      }

      const bundle = await fetchOfflineBundle({
        allYears: true,
        offset,
        limit: OFFLINE_BATCH_SIZE,
      });

      await mergeBundleIntoDb(bundle, { persistReference: offset === 0 });
      totalAvailable = bundle.meta.totalAvailable ?? totalAvailable;
      totalCached += bundle.policies.length;
      lastSyncedAt = bundle.meta.syncedAt;
      scopeHash = bundle.meta.scopeHash;

      opts?.onProgress?.({
        phase: "details",
        current: totalCached,
        total: Math.max(totalAvailable, totalCached),
        message: `Downloaded ${totalCached.toLocaleString()} of ${Math.max(totalAvailable, totalCached).toLocaleString()} policies…`,
      });

      if (!bundle.meta.hasMore || bundle.policies.length === 0) {
        break;
      }
      offset += bundle.policies.length;
    }

    await prefetchReferenceNoPool(50);

    const db = getOfflineDb();
    const actualCount = await db.policies_list.count();

    await updateMeta({
      lastSyncAt: lastSyncedAt,
      lastSyncPolicyCount: actualCount,
      scopePolicyTotal: totalAvailable || actualCount,
      scopeHash,
    });

    opts?.onProgress?.({
      phase: "done",
      current: actualCount,
      total: totalAvailable || actualCount,
      message: `All ${actualCount.toLocaleString()} policies saved for offline use.`,
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("svkk-cache-synced"));
      void warmPolicyAppShellCache();
    }

    return { totalCached: actualCount, totalAvailable: totalAvailable || actualCount };
  } catch (e) {
    throw e;
  }
}

export async function prefetchReferenceNoPool(count = 20): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  try {
    const res = await svkkJson<{ referenceNos: string[] }>(
      `/policies/offline-id-batch?count=${count}`,
      { method: "POST" },
    );
    const db = getOfflineDb();
    await db.id_pool.bulkAdd((res.referenceNos ?? []).map((referenceNo) => ({ referenceNo })));
  } catch {
    /* best effort */
  }
}

export async function takePooledReferenceNo(): Promise<string | null> {
  const db = getOfflineDb();
  const row = await db.id_pool.orderBy("id").first();
  if (!row?.id) return null;
  await db.id_pool.delete(row.id);
  return row.referenceNo;
}
