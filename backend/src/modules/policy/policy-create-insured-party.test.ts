import { describe, expect, it, vi, beforeEach } from "vitest";
import type { InsuredParty } from "@prisma/client";
import {
  assertMobileAvailableForNewInsuredParty,
  resolveInsuredPartyForPolicyCreate,
} from "./policy-create-insured-party.js";

const partyA: InsuredParty = {
  id: "party-a",
  customerId: "CUST-1",
  mobile: "+919876543210",
  svkkPublicId: "RTYMAY3042",
  name: "Holder A",
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
  byCustomerId?: InsuredParty | null;
  bySvkk?: InsuredParty | null;
  byMobile?: InsuredParty | null;
}) {
  return {
    insuredParty: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, string> }) => {
        if ("customerId" in where) return overrides.byCustomerId ?? null;
        if ("svkkPublicId" in where) return overrides.bySvkk ?? null;
        if ("mobile" in where) return overrides.byMobile ?? null;
        return null;
      }),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };
}

vi.mock("./insured-party-mobile.js", () => ({
  reconcileInsuredPartyMobile: vi.fn(async (_tx, party: InsuredParty) => party),
}));

describe("resolveInsuredPartyForPolicyCreate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not match by mobile or customer id when svkk id is absent", async () => {
    const tx = mockTx({ byMobile: partyA, byCustomerId: partyA });
    const out = await resolveInsuredPartyForPolicyCreate(tx as never, {
      customSvkk: null,
      mobile: partyA.mobile,
    });
    expect(out).toBeNull();
    expect(tx.insuredParty.findUnique).not.toHaveBeenCalled();
  });

  it("does not match by customer id when svkk id is absent", async () => {
    const tx = mockTx({ byCustomerId: partyA });
    const out = await resolveInsuredPartyForPolicyCreate(tx as never, {
      customSvkk: null,
      mobile: partyA.mobile,
    });
    expect(out).toBeNull();
    expect(tx.insuredParty.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: "CUST-1" } }),
    );
  });

  it("matches by svkk id only", async () => {
    const tx = mockTx({ bySvkk: partyA });
    const out = await resolveInsuredPartyForPolicyCreate(tx as never, {
      customSvkk: "RTYMAY3042",
      mobile: partyA.mobile,
    });
    expect(out).toEqual(partyA);
    expect(tx.insuredParty.findUnique).toHaveBeenCalledWith({
      where: { svkkPublicId: "RTYMAY3042" },
    });
  });
});

describe("assertMobileAvailableForNewInsuredParty", () => {
  it("throws when mobile belongs to another party", async () => {
    const tx = mockTx({ byMobile: partyA });
    await expect(
      assertMobileAvailableForNewInsuredParty(tx as never, partyA.mobile),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      statusCode: 409,
    });
  });

  it("allows mobile when it belongs to the same party", async () => {
    const tx = mockTx({ byMobile: partyA });
    await expect(
      assertMobileAvailableForNewInsuredParty(tx as never, partyA.mobile, partyA.id),
    ).resolves.toBeUndefined();
  });
});
