import { apiPatch, apiPost, svkkJson } from "@/lib/svkk/api";
import { AxiosError } from "axios";
import { getOfflineDb, updateMeta } from "./db";
import { logOfflineEvent } from "./analytics-log";
import type { OfflineMutation, SyncResult, SyncTrigger } from "./types";
import { expandDetail } from "./compress";
import type { SvkkPolicyDetailForForm } from "@/features/svkk-policies/ad-policy-detail-to-form";
import { repairCreatePayloadChart } from "./offline-chart-resolve";
import { prepareOfflineCreatePayloadForSync } from "./offline-svkk-id";

let syncInProgress = false;

function formatSyncError(e: unknown): { msg: string; status: number | null } {
  if (e instanceof AxiosError) {
    const status = e.response?.status ?? null;
    const data = e.response?.data;
    if (data && typeof data === "object" && "message" in data) {
      const apiMsg = (data as { message?: unknown }).message;
      if (typeof apiMsg === "string" && apiMsg.trim()) {
        return { msg: apiMsg.trim(), status };
      }
    }
    if (status) {
      return { msg: `Request failed (HTTP ${status})`, status };
    }
    return { msg: e.message || "Network error — is the API server running?", status };
  }
  if (e instanceof Error) {
    return { msg: e.message, status: null };
  }
  return { msg: "Sync failed", status: null };
}

export function isSyncRunning(): boolean {
  return syncInProgress;
}

export async function syncPendingMutations(trigger: SyncTrigger): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { skipped: true };
  }
  if (syncInProgress) {
    await logOfflineEvent("sync_skipped", { reason: "already_running", trigger });
    return { skipped: true };
  }

  syncInProgress = true;
  let synced = 0;
  let failed = 0;
  let conflicts = 0;

  try {
    const db = getOfflineDb();
    const pending = await db.mutations
      .where("status")
      .anyOf(["pending", "failed"])
      .sortBy("createdAt");

    if (!pending.length) {
      return { synced: 0, failed: 0, conflicts: 0 };
    }

    await logOfflineEvent("sync_started", { trigger, pendingCount: pending.length });

    for (const mut of pending) {
      const result = await syncOneMutation(mut);
      if (result === "synced") synced += 1;
      else if (result === "conflict") conflicts += 1;
      else failed += 1;
    }

    await logOfflineEvent("sync_completed", { synced, failed, conflicts, trigger });
    if (typeof window !== "undefined" && synced + failed + conflicts > 0) {
      window.dispatchEvent(new CustomEvent("svkk-cache-synced"));
    }
    return { synced, failed, conflicts };
  } finally {
    syncInProgress = false;
  }
}

async function syncOneMutation(mut: OfflineMutation): Promise<"synced" | "conflict" | "failed"> {
  const db = getOfflineDb();
  await db.mutations.update(mut.id, { status: "syncing" });

  try {
    if (mut.kind === "create") {
      const headers: Record<string, string> = {};
      if (mut.idempotencyKey) {
        headers["Idempotency-Key"] = mut.idempotencyKey;
      }
      const payload = prepareOfflineCreatePayloadForSync(
        await repairCreatePayloadChart(mut.payload),
      );
      if (payload.policyChartId !== mut.payload.policyChartId || payload.svkkPublicId !== mut.payload.svkkPublicId) {
        await db.mutations.update(mut.id, { payload: { ...mut.payload, ...payload } });
      }
      const res = await apiPost<Record<string, unknown>>("/policies", payload, { headers });
      const serverId = typeof res.id === "string" ? res.id : null;
      if (serverId) {
        await db.mutations.update(mut.id, { status: "synced", policyId: serverId });
        await db.policies_list.delete(mut.clientTempId);
        await db.policies_detail.delete(mut.clientTempId);
        await refreshPolicyCacheAfterSync(serverId);
      } else {
        await db.mutations.update(mut.id, { status: "synced" });
      }
      return "synced";
    }

    if (mut.kind === "update" && mut.policyId) {
      await apiPatch(`/policies/${mut.policyId}`, mut.payload);
      await db.mutations.update(mut.id, { status: "synced" });
      await refreshPolicyCacheAfterSync(mut.policyId);
      return "synced";
    }

    throw new Error("Invalid mutation");
  } catch (e) {
    const { msg, status } = formatSyncError(e);
    const isConflict = status === 409 || /updated|concurrency|conflict/i.test(msg);

    if (isConflict) {
      await db.mutations.update(mut.id, {
        status: "conflict",
        lastError: msg,
        httpStatus: status,
      });
      await logOfflineEvent("conflict_detected", {
        mutationId: mut.id,
        policyId: mut.policyId,
      });
      return "conflict";
    }

    await db.mutations.update(mut.id, {
      status: "failed",
      lastError: msg,
      httpStatus: status,
    });
    await logOfflineEvent("sync_failed", {
      mutationId: mut.id,
      error: msg,
      httpStatus: status,
    });
    return "failed";
  }
}

export async function registerBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration>((_, reject) => {
        setTimeout(() => reject(new Error("service-worker-ready-timeout")), 2_000);
      }),
    ]);
    const syncManager = (reg as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (syncManager) {
      await syncManager.register("policy-sync");
    }
  } catch {
    /* unsupported, dev without SW, or offline */
  }
}

async function refreshPolicyCacheAfterSync(policyId: string): Promise<void> {
  try {
    const detail = await svkkJson<SvkkPolicyDetailForForm>(`/policies/${policyId}`);
    await applySyncedDetailToCache(policyId, detail);
    const { compressListRowFromDetail } = await import("./compress");
    const db = getOfflineDb();
    await db.policies_list.put(compressListRowFromDetail(detail));
  } catch {
    /* cache refresh is best-effort */
  }
}

export async function queueOfflineMutation(
  mut: Omit<OfflineMutation, "status" | "createdAt"> & { status?: OfflineMutation["status"] },
): Promise<string> {
  const db = getOfflineDb();

  // One pending update per policy — latest offline save wins, same server base version.
  if (mut.kind === "update" && mut.policyId) {
    const existing = await db.mutations
      .where("policyId")
      .equals(mut.policyId)
      .filter((m) => m.kind === "update" && m.status !== "synced")
      .toArray();
    for (const old of existing) {
      await db.mutations.delete(old.id);
    }
  }

  const row: OfflineMutation = {
    ...mut,
    status: mut.status ?? "pending",
    createdAt: new Date().toISOString(),
  };
  await db.mutations.put(row);
  await logOfflineEvent("offline_save_queued", {
    kind: mut.kind,
    policyId: mut.policyId,
  });
  void registerBackgroundSync();
  return row.id;
}

export async function applySyncedDetailToCache(
  policyId: string,
  detail: SvkkPolicyDetailForForm,
): Promise<void> {
  const db = getOfflineDb();
  await db.policies_detail.put(detail);
  await updateMeta({ lastSyncAt: new Date().toISOString() });
}

export async function getConflictMutations(): Promise<OfflineMutation[]> {
  const db = getOfflineDb();
  return db.mutations.where("status").equals("conflict").toArray();
}

export async function getFailedMutations(): Promise<OfflineMutation[]> {
  const db = getOfflineDb();
  return db.mutations.where("status").equals("failed").sortBy("createdAt");
}

export async function discardMutation(id: string): Promise<void> {
  const db = getOfflineDb();
  await db.mutations.delete(id);
}

export async function retryMutation(id: string): Promise<{ ok: boolean; message?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, message: "Connect to the internet to retry sync." };
  }

  const db = getOfflineDb();
  const mut = await db.mutations.get(id);
  if (!mut) {
    return { ok: false, message: "Queued change not found." };
  }

  if (mut.kind === "update" && mut.policyId) {
    try {
      const detail = await svkkJson<{ updatedAt: string }>(`/policies/${mut.policyId}`);
      const serverUpdatedAt = detail.updatedAt;
      const payload = { ...mut.payload, expectedUpdatedAt: serverUpdatedAt };
      await db.mutations.update(id, {
        status: "pending",
        lastError: null,
        httpStatus: null,
        expectedUpdatedAt: serverUpdatedAt,
        payload,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load latest policy from server.";
      return { ok: false, message: msg };
    }
  } else {
    await db.mutations.update(id, { status: "pending", lastError: null, httpStatus: null });
  }

  await syncPendingMutations("manual");
  return { ok: true };
}

export function getExpandedDetailFromCache(stored: SvkkPolicyDetailForForm): SvkkPolicyDetailForForm {
  return expandDetail(stored);
}
