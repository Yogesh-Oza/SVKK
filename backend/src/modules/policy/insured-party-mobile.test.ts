import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors/app-error.js";
import { reconcileInsuredPartyMobile } from "./insured-party-mobile.js";

const baseParty = {
  id: "party-1",
  customerId: "CUST-1",
  mobile: "+919876543210",
  svkkPublicId: "SVKK1001",
  name: "Test Holder",
  email: null,
  pan: null,
  aadhaarNo: null,
  dateOfBirth: null,
  createdInMigrationRunId: null,
  migratedRunId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockTx(overrides: {
  findFirst?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}) {
  return {
    insuredParty: {
      findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(null),
      update: overrides.update ?? vi.fn().mockResolvedValue(baseParty),
    },
  };
}

describe("reconcileInsuredPartyMobile", () => {
  it("returns the same party when mobile is unchanged after normalization", async () => {
    const tx = mockTx({});
    const out = await reconcileInsuredPartyMobile(tx as never, baseParty, "9876543210");
    expect(out).toBe(baseParty);
    expect(tx.insuredParty.findFirst).not.toHaveBeenCalled();
    expect(tx.insuredParty.update).not.toHaveBeenCalled();
  });

  it("updates mobile when customer id party uses a new unique number", async () => {
    const updated = { ...baseParty, mobile: "+919111222333" };
    const update = vi.fn().mockResolvedValue(updated);
    const tx = mockTx({ update });

    const out = await reconcileInsuredPartyMobile(tx as never, baseParty, "9111222333");
    expect(out.mobile).toBe("+919111222333");
    expect(update).toHaveBeenCalledWith({
      where: { id: "party-1" },
      data: { mobile: "+919111222333" },
    });
  });

  it("rejects when the new mobile belongs to another party", async () => {
    const tx = mockTx({
      findFirst: vi.fn().mockResolvedValue({ id: "party-2" }),
    });

    await expect(
      reconcileInsuredPartyMobile(tx as never, baseParty, "9000000000"),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Mobile number already in use",
    });
    expect(tx.insuredParty.update).not.toHaveBeenCalled();
  });

  it("throws AppError for invalid mobile input", async () => {
    const tx = mockTx({});
    await expect(reconcileInsuredPartyMobile(tx as never, baseParty, "")).rejects.toBeInstanceOf(
      AppError,
    );
  });
});
