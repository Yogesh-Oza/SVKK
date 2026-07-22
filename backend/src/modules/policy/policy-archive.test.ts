import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors/app-error.js";

const policyFindFirst = vi.hoisted(() => vi.fn());
const policyUpdate = vi.hoisted(() => vi.fn());
const policyDelete = vi.hoisted(() => vi.fn());
const policyCount = vi.hoisted(() => vi.fn());
const paymentCount = vi.hoisted(() => vi.fn());
const chequeDeleteMany = vi.hoisted(() => vi.fn());
const insuredPartyDeleteMany = vi.hoisted(() => vi.fn());
const activityLogFindFirst = vi.hoisted(() => vi.fn());
const writeActivityLog = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    policy: {
      findFirst: (...args: unknown[]) => policyFindFirst(...args),
      update: (...args: unknown[]) => policyUpdate(...args),
      delete: (...args: unknown[]) => policyDelete(...args),
      count: (...args: unknown[]) => policyCount(...args),
    },
    activityLog: {
      findFirst: (...args: unknown[]) => activityLogFindFirst(...args),
    },
    payment: {
      count: (...args: unknown[]) => paymentCount(...args),
    },
    cheque: {
      deleteMany: (...args: unknown[]) => chequeDeleteMany(...args),
    },
    insuredParty: {
      deleteMany: (...args: unknown[]) => insuredPartyDeleteMany(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
  },
}));

vi.mock("../../services/activity-log.service.js", () => ({
  writeActivityLog: (...args: unknown[]) => writeActivityLog(...args),
}));

import {
  permanentlyDeleteArchivedPolicy,
  restoreArchivedPolicy,
  buildArchivedPolicyReadWhere,
} from "./policy-archive.js";

describe("buildArchivedPolicyReadWhere", () => {
  it("swaps active deletedAt:null filters to archived", () => {
    const where = buildArchivedPolicyReadWhere(
      { kind: "full" },
      undefined,
      "user-1",
      new Set(["policy:scope_all"]),
    );
    expect(where).toEqual({ deletedAt: { not: null } });
  });
});

describe("restoreArchivedPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    policyUpdate.mockResolvedValue({
      id: "p1",
      policyNo: "PN-1",
      referenceNo: "REF-1",
    });
    writeActivityLog.mockResolvedValue(undefined);
    activityLogFindFirst.mockResolvedValue(null);
  });

  it("restores snapshot policyNo and referenceNo", async () => {
    policyFindFirst
      .mockResolvedValueOnce({
        id: "p1",
        deletedAt: new Date("2026-01-01"),
        policyTypeId: "pt1",
        archivedPolicyNo: "PN-1",
        archivedReferenceNo: "REF-1",
        village: "V1",
        insuredParty: { name: "Holder" },
        holderName: "Holder",
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const row = await restoreArchivedPolicy({ actorUserId: "u1", policyId: "p1" });

    expect(policyUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        deletedAt: null,
        policyNo: "PN-1",
        referenceNo: "REF-1",
        archivedPolicyNo: null,
        archivedReferenceNo: null,
      },
    });
    expect(writeActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "POLICY_RESTORED", entityId: "p1" }),
    );
    expect(row.policyNo).toBe("PN-1");
  });

  it("fails with RESTORE_CONFLICT when referenceNo is taken", async () => {
    policyFindFirst
      .mockResolvedValueOnce({
        id: "p1",
        deletedAt: new Date("2026-01-01"),
        policyTypeId: "pt1",
        archivedPolicyNo: null,
        archivedReferenceNo: "REF-1",
        village: "V1",
        insuredParty: { name: "Holder" },
        holderName: "Holder",
      })
      .mockResolvedValueOnce({ id: "other" });

    await expect(restoreArchivedPolicy({ actorUserId: "u1", policyId: "p1" })).rejects.toMatchObject({
      code: "RESTORE_CONFLICT",
      statusCode: 409,
    });
    expect(policyUpdate).not.toHaveBeenCalled();
  });

  it("fails when policy is not archived", async () => {
    policyFindFirst.mockResolvedValueOnce(null);
    await expect(restoreArchivedPolicy({ actorUserId: "u1", policyId: "p1" })).rejects.toBeInstanceOf(
      AppError,
    );
  });
});

describe("permanentlyDeleteArchivedPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeActivityLog.mockResolvedValue(undefined);
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const properTx = {
        policy: { delete: policyDelete, count: policyCount },
        payment: { count: paymentCount },
        cheque: { deleteMany: chequeDeleteMany },
        insuredParty: { deleteMany: insuredPartyDeleteMany },
      };
      return fn(properTx);
    });
    policyDelete.mockResolvedValue({});
    paymentCount.mockResolvedValue(0);
    chequeDeleteMany.mockResolvedValue({ count: 1 });
    policyCount.mockResolvedValue(0);
    insuredPartyDeleteMany.mockResolvedValue({ count: 1 });
  });

  it("hard-deletes archived policy and orphan party/cheques", async () => {
    policyFindFirst.mockResolvedValueOnce({
      id: "p1",
      deletedAt: new Date("2026-01-01"),
      insuredPartyId: "party-1",
      archivedPolicyNo: "PN-1",
      archivedReferenceNo: "REF-1",
      village: "V1",
      insuredParty: { id: "party-1", name: "Holder", svkkPublicId: "svkk1" },
      years: [{ id: "y1", payments: [{ chequeId: "ch1" }, { chequeId: null }] }],
    });

    await permanentlyDeleteArchivedPolicy({ actorUserId: "u1", policyId: "p1" });

    expect(policyDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(chequeDeleteMany).toHaveBeenCalledWith({ where: { id: "ch1" } });
    expect(insuredPartyDeleteMany).toHaveBeenCalledWith({ where: { id: "party-1" } });
    expect(writeActivityLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "POLICY_PURGED", entityId: "p1" }),
    );
  });

  it("refuses permanent delete for non-archived policies", async () => {
    policyFindFirst.mockResolvedValueOnce(null);
    await expect(
      permanentlyDeleteArchivedPolicy({ actorUserId: "u1", policyId: "p1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 });
  });
});
