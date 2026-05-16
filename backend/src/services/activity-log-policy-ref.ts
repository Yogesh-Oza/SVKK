import { prisma } from "../lib/prisma.js";

export type PolicyDisplayRef = {
  referenceNo: string | null;
  policyNo: string | null;
  svkkPublicId: string | null;
  holderName: string | null;
  village: string | null;
  yearLabel: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Read business identifiers from stored log JSON (no DB). */
export function policyDisplayRefFromPayload(
  beforeData: unknown,
  afterData: unknown,
): PolicyDisplayRef | null {
  const after = asRecord(afterData);
  const before = asRecord(beforeData);
  const policy = asRecord(after?.policy) ?? asRecord(before?.policy) ?? after ?? before;
  if (!policy && !after && !before) return null;

  const party =
    asRecord(policy?.insuredParty) ??
    asRecord(after?.insuredParty) ??
    asRecord(before?.insuredParty);

  const ref: PolicyDisplayRef = {
    referenceNo: pickStr(policy?.referenceNo, after?.referenceNo, before?.referenceNo),
    policyNo: pickStr(policy?.policyNo, after?.policyNo, before?.policyNo),
    svkkPublicId: pickStr(party?.svkkPublicId, after?.svkkPublicId, before?.svkkPublicId),
    holderName: pickStr(party?.name, after?.holderName, before?.holderName),
    village: pickStr(policy?.village, after?.village, before?.village),
    yearLabel: pickStr(after?.yearLabel, before?.yearLabel, policy?.yearLabel),
  };

  if (
    ref.referenceNo ||
    ref.policyNo ||
    ref.svkkPublicId ||
    ref.holderName ||
    ref.village ||
    ref.yearLabel
  ) {
    return ref;
  }
  return null;
}

export async function fetchPolicyDisplayRef(policyId: string): Promise<PolicyDisplayRef | null> {
  const row = await prisma.policy.findUnique({
    where: { id: policyId },
    select: {
      referenceNo: true,
      policyNo: true,
      village: true,
      insuredParty: { select: { name: true, svkkPublicId: true } },
      years: {
        where: { deletedAt: null },
        orderBy: { yearLabel: "desc" },
        take: 1,
        select: { yearLabel: true },
      },
    },
  });
  if (!row) return null;
  return {
    referenceNo: row.referenceNo,
    policyNo: row.policyNo,
    svkkPublicId: row.insuredParty.svkkPublicId,
    holderName: row.insuredParty.name,
    village: row.village,
    yearLabel: row.years[0]?.yearLabel ?? null,
  };
}

export async function resolvePolicyDisplayRef(
  policyId: string,
  beforeData: unknown,
  afterData: unknown,
): Promise<PolicyDisplayRef> {
  const fromPayload = policyDisplayRefFromPayload(beforeData, afterData);
  if (fromPayload?.referenceNo || fromPayload?.policyNo) {
    return fromPayload;
  }
  const fromDb = await fetchPolicyDisplayRef(policyId);
  if (fromDb) {
    return {
      referenceNo: fromDb.referenceNo ?? fromPayload?.referenceNo ?? null,
      policyNo: fromDb.policyNo ?? fromPayload?.policyNo ?? null,
      svkkPublicId: fromDb.svkkPublicId ?? fromPayload?.svkkPublicId ?? null,
      holderName: fromDb.holderName ?? fromPayload?.holderName ?? null,
      village: fromDb.village ?? fromPayload?.village ?? null,
      yearLabel: fromDb.yearLabel ?? fromPayload?.yearLabel ?? null,
    };
  }
  return (
    fromPayload ?? {
      referenceNo: null,
      policyNo: null,
      svkkPublicId: null,
      holderName: null,
      village: null,
      yearLabel: null,
    }
  );
}

/** Primary label for a policy in UI (SVKK reference preferred). */
export function policyPrimaryLabel(ref: PolicyDisplayRef): string | null {
  return ref.referenceNo ?? ref.policyNo ?? ref.svkkPublicId;
}

export function formatPolicyDetailLines(ref: PolicyDisplayRef): string[] {
  const lines: string[] = [];
  if (ref.referenceNo) lines.push(`Reference: ${ref.referenceNo}`);
  if (ref.policyNo) lines.push(`Policy number: ${ref.policyNo}`);
  if (ref.svkkPublicId) lines.push(`SVKK ID: ${ref.svkkPublicId}`);
  if (ref.holderName) lines.push(`Holder: ${ref.holderName}`);
  if (ref.village) lines.push(`Village: ${ref.village}`);
  if (ref.yearLabel) lines.push(`Year: ${ref.yearLabel}`);
  return lines;
}

const HIDDEN_PAYLOAD_KEYS = new Set(["policyId", "yearId"]);

/** User-facing snapshot: business fields only (no internal cuid ids). */
export function buildPolicyLogDisplayPayload(
  data: unknown,
  ref: PolicyDisplayRef,
): Record<string, unknown> | null {
  const raw = asRecord(data);
  const out: Record<string, unknown> = {};

  if (ref.referenceNo) out.referenceNo = ref.referenceNo;
  if (ref.policyNo) out.policyNo = ref.policyNo;
  if (ref.svkkPublicId) out.svkkPublicId = ref.svkkPublicId;
  if (ref.holderName) out.holderName = ref.holderName;
  if (ref.village) out.village = ref.village;
  if (ref.yearLabel) out.yearLabel = ref.yearLabel;

  if (raw) {
    for (const [key, value] of Object.entries(raw)) {
      if (HIDDEN_PAYLOAD_KEYS.has(key)) continue;
      if (key === "policy" && value && typeof value === "object") {
        const p = value as Record<string, unknown>;
        for (const [pk, pv] of Object.entries(p)) {
          if (HIDDEN_PAYLOAD_KEYS.has(pk) || pk === "id" || pk === "insuredPartyId") continue;
          if (pv !== undefined && pv !== null && out[pk] === undefined) out[pk] = pv;
        }
        continue;
      }
      if (out[key] === undefined && !HIDDEN_PAYLOAD_KEYS.has(key) && key !== "id") {
        out[key] = value;
      }
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}
