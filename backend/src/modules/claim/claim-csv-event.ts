import { ClaimEventKind, ClaimEventOutcome } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { ParsedClaimRow } from "./claim-csv-import.js";
import { claimEventKeyFromRow } from "./claim-event-key.js";

export type UpsertClaimEventResult = "created" | "updated";

export async function upsertClaimSourceEvent(
  opts: {
    claimId: string;
    row: ParsedClaimRow;
    kind: ClaimEventKind;
    outcome: ClaimEventOutcome;
    rejectionReason?: string | null;
    importJobId?: string | null;
  },
): Promise<UpsertClaimEventResult> {
  const eventKey = claimEventKeyFromRow(opts.row);
  const existing = await prisma.claimEvent.findUnique({
    where: { eventKey },
    select: { id: true },
  });

  const data = {
    claimId: opts.claimId,
    sourceRowNumber: opts.row.rowNumber,
    kind: opts.kind,
    outcome: opts.outcome,
    rejectionReason: opts.rejectionReason ?? null,
    claimType: opts.row.claimType,
    actualLodgeType: opts.row.actualLodgeType,
    status: opts.row.status,
    statusText: opts.row.statusText,
    claimAmount: opts.row.claimAmount,
    reportedLodgeAmount: opts.row.reportedLodgeAmount,
    approvedAmount: opts.row.approvedAmount,
    deductionAmount: opts.row.deductionAmount,
    discountAmount: opts.row.discountAmount,
    admissionDate: opts.row.admissionDate,
    dischargeDate: opts.row.dischargeDate,
    lodgeDate: opts.row.lodgeDate,
    claimReceivedDate: opts.row.claimReceivedDate,
    paymentDate: opts.row.paymentDate,
    paymentDetails: opts.row.paymentDetails,
    paymentInFavourOf: opts.row.paymentInFavourOf,
    remark: opts.row.remark,
    importJobId: opts.importJobId ?? null,
  };

  if (existing) {
    await prisma.claimEvent.update({
      where: { id: existing.id },
      data,
    });
    return "updated";
  }

  await prisma.claimEvent.create({
    data: {
      eventKey,
      ...data,
    },
  });
  return "created";
}

export function kindFromSourceRole(
  role: "canonical" | "same_claim" | "different_event",
): ClaimEventKind {
  if (role === "canonical") return ClaimEventKind.CANONICAL;
  if (role === "different_event") return ClaimEventKind.DIFFERENT_EVENT;
  return ClaimEventKind.SAME_EVENT;
}
