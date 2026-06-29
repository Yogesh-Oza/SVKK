import Dexie, { type Table } from "dexie";
import type {
  AuthSnapshotRecord,
  OfflineAnalyticsLogEntry,
  OfflineMetaRecord,
  OfflineMutation,
  OfflinePolicyFormDetail,
  OfflinePolicyListRow,
  OfflineReferenceBundle,
} from "./types";
import { OFFLINE_SCHEMA_VERSION as SCHEMA_VERSION } from "./types";

export class SvkkOfflineDb extends Dexie {
  meta!: Table<OfflineMetaRecord, string>;
  policies_list!: Table<OfflinePolicyListRow, string>;
  policies_detail!: Table<OfflinePolicyFormDetail, string>;
  reference!: Table<OfflineReferenceBundle & { key: string }, string>;
  id_pool!: Table<{ id?: number; referenceNo: string }, number>;
  mutations!: Table<OfflineMutation, string>;
  auth_snapshot!: Table<AuthSnapshotRecord, string>;
  analytics_log!: Table<OfflineAnalyticsLogEntry, string>;

  constructor() {
    super("svkk_offline_v1");

    this.version(1).stores({
      meta: "key",
      policies_list: "id, policyNo, holderName, svkkId, mobile, village, yearLabel, customerId, updatedAt",
      policies_detail: "id, updatedAt",
      reference: "key",
      id_pool: "++id, referenceNo",
      mutations: "id, status, policyId, clientTempId, createdAt",
      auth_snapshot: "key",
      analytics_log: "id, event, at",
    });

    this.version(2).stores({
      meta: "key",
      policies_list: "id, policyNo, holderName, svkkId, mobile, village, yearLabel, customerId, updatedAt",
      policies_detail: "id, updatedAt",
      reference: "key",
      id_pool: "++id, referenceNo",
      mutations: "id, status, policyId, clientTempId, createdAt",
      auth_snapshot: "key",
      analytics_log: "id, event, at",
    });

    this.version(3).stores({
      meta: "key",
      policies_list:
        "id, policyNo, holderName, svkkId, mobile, village, yearLabel, periodMonthText, customerId, policyTypeId, categoryId, updatedAt, createdAt",
      policies_detail: "id, updatedAt",
      reference: "key",
      id_pool: "++id, referenceNo",
      mutations: "id, status, policyId, clientTempId, createdAt",
      auth_snapshot: "key",
      analytics_log: "id, event, at",
    });

    this.version(4).stores({
      meta: "key",
      policies_list:
        "id, policyNo, holderName, svkkId, mobile, village, yearLabel, periodMonthText, customerId, policyTypeId, categoryId, updatedAt, createdAt",
      policies_detail: "id, updatedAt",
      reference: "key",
      id_pool: "++id, referenceNo",
      mutations: "id, status, policyId, clientTempId, createdAt",
      auth_snapshot: "key",
      analytics_log: "id, event, at",
    });
  }
}

let dbInstance: SvkkOfflineDb | null = null;

export function getOfflineDb(): SvkkOfflineDb {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available");
  }
  if (!dbInstance) {
    dbInstance = new SvkkOfflineDb();
  }
  return dbInstance;
}

export async function getOrCreateMeta(): Promise<OfflineMetaRecord> {
  const db = getOfflineDb();
  const existing = await db.meta.get("main");
  if (existing) return existing;
  const fresh: OfflineMetaRecord = {
    key: "main",
    lastSyncAt: null,
    lastSyncPolicyCount: 0,
    scopePolicyTotal: null,
    schemaVersion: SCHEMA_VERSION,
    downloadCursor: null,
    lastQuotaRatio: null,
    premiumSnapshotDate: null,
    premiumSnapshotVersion: null,
    scopeHash: null,
  };
  await db.meta.put(fresh);
  return fresh;
}

export async function updateMeta(patch: Partial<Omit<OfflineMetaRecord, "key">>): Promise<void> {
  const db = getOfflineDb();
  const current = await getOrCreateMeta();
  await db.meta.put({ ...current, ...patch, key: "main", schemaVersion: SCHEMA_VERSION });
}

export { SCHEMA_VERSION as OFFLINE_SCHEMA_VERSION };
