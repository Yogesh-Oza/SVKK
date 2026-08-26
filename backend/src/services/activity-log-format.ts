import type { Prisma } from "@prisma/client";
import {
  formatPolicyDetailLines,
  policyDisplayRefFromPayload,
  policyPrimaryLabel,
  type PolicyDisplayRef,
} from "./activity-log-policy-ref.js";

export type ActivityLogRow = {
  id: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeData: Prisma.JsonValue | null;
  afterData: Prisma.JsonValue | null;
  createdAt: Date;
  user?: { id: string; name: string | null; email: string } | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function policyContext(data: Record<string, unknown> | null): {
  ref?: string;
  holder?: string;
  village?: string;
  year?: string;
} {
  if (!data) return {};
  const policy = asRecord(data.policy) ?? data;
  const party =
    asRecord(policy.insuredParty) ??
    asRecord(data.insuredParty) ??
    asRecord(asRecord(data.party));
  return {
    ref: pickStr(policy.policyNo, policy.referenceNo, data.policyNo, data.referenceNo),
    holder: pickStr(party?.name, data.holderName),
    village: pickStr(policy.village, data.village),
    year: pickStr(data.yearLabel, policy.yearLabel),
  };
}

function ctxSuffix(ctx: ReturnType<typeof policyContext>): string {
  const parts: string[] = [];
  if (ctx.ref) parts.push(`ref ${ctx.ref}`);
  if (ctx.holder) parts.push(ctx.holder);
  if (ctx.village) parts.push(ctx.village);
  if (ctx.year) parts.push(`year ${ctx.year}`);
  return parts.length ? ` (${parts.join(" · ")})` : "";
}

const POLICY_SCALAR_KEYS: { key: string; label: string }[] = [
  { key: "policyNo", label: "policy number" },
  { key: "referenceNo", label: "reference number" },
  { key: "village", label: "village" },
  { key: "area", label: "area" },
  { key: "remarks", label: "remarks" },
  { key: "policyUrl", label: "document link" },
  { key: "personsInsuredCount", label: "persons insured" },
];

function diffPolicyScalars(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  const b = before ?? {};
  const a = after ?? {};
  const changed: string[] = [];
  for (const { key, label } of POLICY_SCALAR_KEYS) {
    const bv = b[key];
    const av = a[key];
    if (bv !== av && (bv !== undefined || av !== undefined)) {
      changed.push(label);
    }
  }
  const bParty = asRecord(b.insuredParty);
  const aParty = asRecord(a.insuredParty);
  if (bParty?.name !== aParty?.name && (bParty?.name || aParty?.name)) {
    changed.push("holder name");
  }
  if (bParty?.mobile !== aParty?.mobile && (bParty?.mobile || aParty?.mobile)) {
    changed.push("holder mobile");
  }
  return changed;
}

const ACTION_LABELS: Record<string, string> = {
  POLICY_CREATED: "Created policy",
  POLICY_UPDATED: "Updated policy",
  POLICY_SOFT_DELETED: "Deleted policy",
  POLICY_ONEDRIVE_DOC_ATTACHED: "Attached OneDrive document",
  POLICY_DRIVE_DOC_ATTACHED: "Attached Google Drive document",
  CSV_IMPORTED: "Imported CSV",
  CSV_VALIDATED: "Validated CSV",
  ROLE_CREATED: "Created role",
  ROLE_UPDATED: "Updated role",
  ROLE_CLONED: "Cloned role",
  ROLE_SOFT_DELETED: "Deleted role",
  USER_ROLE_CHANGED: "Changed user role",
  EMAIL_SENT: "Sent email",
  EMAIL_FAILED: "Failed to send email",
  EMAIL_SKIPPED: "Email not sent",
};

export function formatActivityLogSummary(row: ActivityLogRow): string {
  const after = asRecord(row.afterData);
  const before = asRecord(row.beforeData);
  const base = ACTION_LABELS[row.action] ?? row.action.replace(/_/g, " ").toLowerCase();

  switch (row.action) {
    case "POLICY_CREATED": {
      const ctx = policyContext(after);
      return `${base}${ctxSuffix(ctx)}`;
    }
    case "POLICY_SOFT_DELETED": {
      const ctx = policyContext(before ?? after);
      return `${base}${ctxSuffix(ctx)}`;
    }
    case "POLICY_UPDATED": {
      const beforePolicy = asRecord(before?.policy) ?? before;
      const afterPolicy = asRecord(after?.policy) ?? after;
      const changed = diffPolicyScalars(beforePolicy, afterPolicy);
      const ctx = policyContext(after ?? before);
      if (changed.length) {
        return `${base}: ${changed.join(", ")}${ctxSuffix(ctx)}`;
      }
      const yearLabel = pickStr(after?.yearLabel, before?.yearLabel);
      if (yearLabel) {
        return `${base} for year ${yearLabel}${ctxSuffix(ctx)}`;
      }
      return `${base}${ctxSuffix(ctx)}`;
    }
    case "POLICY_ONEDRIVE_DOC_ATTACHED":
    case "POLICY_DRIVE_DOC_ATTACHED": {
      const ctx = policyContext(after);
      return `${base}${ctxSuffix(ctx)}`;
    }
    case "CSV_IMPORTED":
    case "CSV_VALIDATED": {
      const created = Number(after?.created ?? 0);
      const updated = Number(after?.updated ?? 0);
      const successRaw = after?.successCount ?? after?.success;
      const success =
        successRaw !== undefined && successRaw !== null
          ? Number(successRaw)
          : created + updated;
      const fail = Number(after?.failCount ?? after?.fail ?? after?.failed ?? 0);
      const dry = after?.dryRun === true ? " (dry run)" : "";
      const mode = pickStr(after?.importMode);
      const modeHint =
        mode === "UPDATE_ONLY"
          ? " (update)"
          : mode === "CREATE_ONLY"
            ? " (create)"
            : "";
      const file = pickStr(after?.fileName);
      const fileHint = file ? ` — ${file}` : "";
      return `${base}${dry}${modeHint}: ${success} ok, ${fail} failed${fileHint}`;
    }
    case "EMAIL_SENT":
    case "EMAIL_FAILED":
    case "EMAIL_SKIPPED": {
      const parts: string[] = [];
      const to = pickStr(after?.to);
      const holder = pickStr(after?.holderName);
      const policyNo = pickStr(after?.policyNo);
      const templateId = pickStr(after?.templateId);
      if (to) parts.push(`to ${to}`);
      if (templateId) parts.push(templateId.replace(/_/g, " "));
      if (holder) parts.push(holder);
      if (policyNo && policyNo !== "—") parts.push(`policy ${policyNo}`);
      const suffix = parts.length ? `: ${parts.join(" · ")}` : "";
      if (row.action === "EMAIL_SKIPPED" && after?.reason) {
        const reasonLabel =
          after.reason === "smtp_not_configured"
            ? "SMTP not configured"
            : after.reason === "no_recipient" || after.reason === "empty_recipient"
              ? "no recipient"
              : String(after.reason);
        return `${base} (${reasonLabel})${suffix}`;
      }
      if (row.action === "EMAIL_FAILED" && after?.errorMessage) {
        return `${base}${suffix} — ${String(after.errorMessage).slice(0, 120)}`;
      }
      return `${base}${suffix}`;
    }
    default:
      return base;
  }
}

export function formatActivityLogDetails(
  row: ActivityLogRow,
  policyRef?: PolicyDisplayRef | null,
): string[] {
  const lines: string[] = [];
  const after = asRecord(row.afterData);
  const before = asRecord(row.beforeData);

  if (row.entityType === "Policy") {
    const ref = policyRef ?? policyDisplayRefFromPayload(row.beforeData, row.afterData);
    if (ref) {
      lines.push(...formatPolicyDetailLines(ref));
    }
  } else {
    lines.push(`${row.entityType}: ${row.entityId}`);
  }

  // POLICY_UPDATED field-level diffs are returned as `fieldChanges` on the detail API.

  if (
    row.action === "POLICY_ONEDRIVE_DOC_ATTACHED" ||
    row.action === "POLICY_DRIVE_DOC_ATTACHED"
  ) {
    const url = pickStr(after?.policyUrl);
    if (url) lines.push(`Document: ${url}`);
  }

  if (row.action === "CSV_IMPORTED" || row.action === "CSV_VALIDATED") {
    const file = pickStr(after?.fileName);
    if (file) lines.push(`File: ${file}`);
    if (after?.rowCount !== undefined) lines.push(`Rows: ${String(after.rowCount)}`);
    const created = after?.created;
    const updated = after?.updated;
    const fail = after?.failCount ?? after?.fail ?? after?.failed;
    if (created !== undefined) lines.push(`Created: ${String(created)}`);
    if (updated !== undefined) lines.push(`Updated: ${String(updated)}`);
    if (fail !== undefined) lines.push(`Failed: ${String(fail)}`);
    const mode = pickStr(after?.importMode);
    if (mode) lines.push(`Mode: ${mode.replace(/_/g, " ")}`);
    const updateMode = pickStr(after?.updateMode);
    if (updateMode) lines.push(`Update scope: ${updateMode}`);
    if (after?.durationMs !== undefined) {
      lines.push(`Duration: ${String(after.durationMs)} ms`);
    }
    const errUrl = pickStr(after?.errorReportUrl);
    if (errUrl) lines.push(`Error report: ${errUrl}`);
  }

  if (row.module === "email") {
    const to = pickStr(after?.to);
    const subject = pickStr(after?.subject);
    const templateId = pickStr(after?.templateId);
    const source = pickStr(after?.source);
    if (to) lines.push(`Recipient: ${to}`);
    if (subject) lines.push(`Subject: ${subject}`);
    if (templateId) lines.push(`Template: ${templateId}`);
    if (source) lines.push(`Trigger: ${source.replace(/_/g, " ")}`);
    if (after?.reason) lines.push(`Reason: ${String(after.reason).replace(/_/g, " ")}`);
    if (after?.errorMessage) lines.push(`Error: ${String(after.errorMessage)}`);
  }

  return lines;
}

export function formatEntityLabel(
  row: ActivityLogRow,
  policyRef?: PolicyDisplayRef | null,
): string {
  if (row.entityType === "Policy") {
    const ref = policyRef ?? policyDisplayRefFromPayload(row.beforeData, row.afterData);
    const primary = ref ? policyPrimaryLabel(ref) : null;
    if (primary) return `Policy ${primary}`;
    const ctx = policyContext(asRecord(row.afterData) ?? asRecord(row.beforeData));
    if (ctx.ref) return `Policy ${ctx.ref}`;
    return "Policy";
  }
  if (row.entityType === "EmailTemplate") {
    const tpl = pickStr(asRecord(row.afterData)?.templateId) ?? row.entityId;
    return `Email template ${tpl.replace(/_/g, " ")}`;
  }
  return row.entityType;
}
