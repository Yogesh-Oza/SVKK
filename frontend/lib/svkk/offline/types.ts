import type { SvkkPolicyDetailForForm } from "@/features/svkk-policies/ad-policy-detail-to-form";
import type { PremiumSnapshot } from "@/lib/svkk/premium/storage";
import type { DropdownOptionsMap } from "@/lib/svkk/dropdown-options";
import type { SvkkUser } from "@/lib/svkk/types";

export type PolicyChartRef = {
  id: string;
  policyTypeId?: string;
  chartKind: string;
  version?: number;
};

/** Indexed list row stored in IDB (register + grouping fields). */
export type OfflinePolicyListRow = {
  id: string;
  policyNo: string | null;
  holderName: string | null;
  svkkId: string;
  mobile: string | null;
  email: string | null;
  pan: string | null;
  village: string | null;
  area: string | null;
  yearLabel: string;
  periodMonthText: string | null;
  periodYearText: string | null;
  customerId: string | null;
  previousPolicyNo?: string | null;
  referenceNo: string | null;
  vkkPremium: string | null;
  sumInsured: string | null;
  policyTypeId: string | null;
  policyTypeName: string | null;
  policyTypeKey: string | null;
  categoryId: string | null;
  categoryKey: string | null;
  categoryName: string | null;
  categoryText: string | null;
  remarks: string | null;
  personsInsuredCount: number | null;
  whatsappNo: string | null;
  policyGrouping: string | null;
  adProductVariant: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
};

/** Form/edit/carry-forward detail — same shape as API detail subset. */
export type OfflinePolicyFormDetail = SvkkPolicyDetailForForm;

export type OfflineReferenceBundle = {
  dropdowns: Partial<DropdownOptionsMap>;
  categories: Array<{ id: string; value: string; label: string }>;
  policyTypes: Array<{ id: string; value: string; label: string }>;
  policyGroupings: string[];
  /** Latest chart id per policy type — used offline when type changes on the add form. */
  policyChartsByTypeId?: Record<string, PolicyChartRef[]>;
  premiumSnapshot: PremiumSnapshot;
  premiumSnapshotVersion: string;
  premiumSnapshotDate: string;
};

export type OfflineBundleMeta = {
  syncedAt: string;
  policyCount: number;
  /** Total policies in user scope matching this request (full / paginated download). */
  totalAvailable?: number;
  offset?: number;
  hasMore?: boolean;
  premiumSnapshotVersion: string;
  scopeHash: string;
};

export type OfflineBundleResponse = {
  meta: OfflineBundleMeta;
  policies: OfflinePolicyListRow[];
  details: OfflinePolicyFormDetail[];
  reference: OfflineReferenceBundle;
  deletedPolicyIds?: string[];
};

export type OfflineMetaRecord = {
  key: "main";
  lastSyncAt: string | null;
  lastSyncPolicyCount: number;
  /** Total in-scope policies on server at last full download. */
  scopePolicyTotal: number | null;
  schemaVersion: number;
  downloadCursor: string | null;
  lastQuotaRatio: number | null;
  premiumSnapshotDate: string | null;
  premiumSnapshotVersion: string | null;
  scopeHash: string | null;
};

export type MutationKind = "create" | "update";

export type MutationStatus = "pending" | "syncing" | "synced" | "conflict" | "failed";

export type OfflineMutation = {
  id: string;
  kind: MutationKind;
  policyId?: string;
  clientTempId: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  expectedUpdatedAt?: string;
  status: MutationStatus;
  createdAt: string;
  lastError?: string | null;
  httpStatus?: number | null;
};

export type AuthSnapshotRecord = {
  key: "current";
  user: SvkkUser;
  savedAt: string;
};

export type OfflineAnalyticsEvent =
  | "offline_download_started"
  | "offline_download_completed"
  | "offline_download_failed"
  | "offline_save_queued"
  | "sync_started"
  | "sync_completed"
  | "sync_failed"
  | "sync_skipped"
  | "conflict_detected"
  | "cache_cleared"
  | "quota_warning";

export type OfflineAnalyticsLogEntry = {
  id: string;
  event: OfflineAnalyticsEvent;
  payload: Record<string, unknown>;
  at: string;
};

export type SyncTrigger = "bg" | "online" | "manual" | "periodic";

export type SyncResult = {
  skipped?: boolean;
  synced?: number;
  failed?: number;
  conflicts?: number;
};

export const OFFLINE_SCHEMA_VERSION = 4;
export const OFFLINE_DEFAULT_LIMIT = 500;
/** Batch size for paginated "download all" requests. */
export const OFFLINE_BATCH_SIZE = 500;
export const OFFLINE_FISCAL_YEARS = 2;
export const PREMIUM_STALE_WARN_DAYS = 7;
export const PREMIUM_STALE_BLOCK_DAYS = 30;
export const QUOTA_WARN_RATIO = 0.8;
export const QUOTA_BLOCK_RATIO = 0.95;
export const AUTH_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Minimum gap between automatic cache sync runs (ms). */
export const BACKGROUND_CACHE_MIN_GAP_MS = 60_000;
/** Interval for periodic delta sync while app is open (ms). */
export const BACKGROUND_CACHE_SYNC_INTERVAL_MS = 5 * 60_000;
