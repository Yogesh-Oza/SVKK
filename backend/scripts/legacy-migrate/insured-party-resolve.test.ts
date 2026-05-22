import { describe, expect, it, vi } from "vitest";
import { resolveInsuredPartyForLegacyRow } from "./insured-party-resolve.js";

function mockTx(state: {
  bySvkk: Map<string, { id: string; svkkPublicId: string; customerId: string | null; mobile: string; name: string }>;
  byCustomer: Map<string, string>;
  byMobile: Map<string, string>;
}) {
  return {
    insuredParty: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, string> }) => {
        if ("svkkPublicId" in where) {
          const id = state.bySvkk.get(where.svkkPublicId)?.id;
          return id ? state.bySvkk.get(where.svkkPublicId) : null;
        }
        if ("customerId" in where) {
          const svkk = state.byCustomer.get(where.customerId);
          return svkk ? state.bySvkk.get(svkk) : null;
        }
        if ("mobile" in where) {
          const svkk = state.byMobile.get(where.mobile);
          return svkk ? state.bySvkk.get(svkk) : null;
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, string> }) => {
        const row = {
          id: `party-${data.svkkPublicId}`,
          svkkPublicId: data.svkkPublicId,
          customerId: (data.customerId as string) ?? null,
          mobile: data.mobile as string,
          name: data.name as string,
        };
        state.bySvkk.set(data.svkkPublicId as string, row);
        if (row.customerId) state.byCustomer.set(row.customerId, row.svkkPublicId);
        state.byMobile.set(row.mobile, row.svkkPublicId);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { name?: string } }) => {
        const existing = [...state.bySvkk.values()].find((p) => p.id === where.id);
        if (existing && data.name) existing.name = data.name;
        return existing;
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const p = [...state.bySvkk.values()].find((x) => x.id === where.id);
        if (!p) throw new Error("not found");
        return p;
      }),
    },
  } as unknown as Parameters<typeof resolveInsuredPartyForLegacyRow>[0];
}

describe("resolveInsuredPartyForLegacyRow", () => {
  it("does not attach a new SVKK to an existing party found only via shared mobile", async () => {
    const state = {
      bySvkk: new Map([
        [
          "SVKK1021",
          {
            id: "p1",
            svkkPublicId: "SVKK1021",
            customerId: "PO81651565",
            mobile: "+919320474184",
            name: "Navin Gabhu Satra",
          },
        ],
      ]),
      byCustomer: new Map([["PO81651565", "SVKK1021"]]),
      byMobile: new Map([["+919320474184", "SVKK1021"]]),
    };
    const tx = mockTx(state);

    const result = await resolveInsuredPartyForLegacyRow(
      tx,
      {
        refNo: "VKK2025JULY1650",
        customerId: "8H3752949",
        svkkPublicId: "SVKK1025",
        mobile: "+919320474184",
        partyName: "Vipul Navin Satra",
        email: null,
        pan: null,
        holderDob: null,
      },
      "run-test",
    );

    expect(result.party.svkkPublicId).toBe("SVKK1025");
    expect(result.created).toBe(true);
    expect(result.warnings).toContain("MOBILE_COLLISION_DIFFERENT_SVKK");
  });
});
