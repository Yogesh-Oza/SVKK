import { describe, expect, it } from "vitest";
import { buildWalletTxnWhere } from "./wallet.list.js";

describe("buildWalletTxnWhere", () => {
  it("filters by type, village, group, month, year, and policyId", () => {
    const where = buildWalletTxnWhere("w1", {
      type: "DEBIT",
      villages: ["Bhachau"],
      groups: ["SVKK"],
      months: ["6"],
      years: ["2026"],
      policyId: "pol-1",
      categories: ["A"],
    });
    expect(where.walletId).toBe("w1");
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { type: "DEBIT" },
        { village: "Bhachau" },
        { groupName: "SVKK" },
        { monthText: "June" },
        { yearText: "2026" },
        { policyId: "pol-1" },
        { category: "A" },
      ]),
    );
  });

  it("filters by date range on dateOfSubmission or txnDate", () => {
    const where = buildWalletTxnWhere("w1", {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-31",
    });
    expect(where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            {
              dateOfSubmission: {
                gte: new Date("2026-08-01T00:00:00.000Z"),
                lte: new Date("2026-08-31T23:59:59.999Z"),
              },
            },
            {
              AND: [
                { dateOfSubmission: null },
                {
                  txnDate: {
                    gte: new Date("2026-08-01T00:00:00.000Z"),
                    lte: new Date("2026-08-31T23:59:59.999Z"),
                  },
                },
              ],
            },
          ],
        },
      ]),
    );
  });

  it("filters by multiple categories and policy types", () => {
    const where = buildWalletTxnWhere("w1", {
      categories: ["A", "B"],
      policyTypes: ["Family Floater", "Individual"],
    });
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { category: { in: ["A", "B"] } },
        { policyTypeName: { in: ["Family Floater", "Individual"] } },
      ]),
    );
  });

  it("search matches holderName, policyNumber, and remark", () => {
    const where = buildWalletTxnWhere("w1", { q: "Kiran" });
    const or = (where.AND as Array<{ OR?: unknown[] }>)[0]?.OR;
    expect(or).toEqual(
      expect.arrayContaining([
        { holderName: { contains: "Kiran" } },
        { policyNumber: { contains: "Kiran" } },
        { remark: { contains: "Kiran" } },
        { particulars: { contains: "Kiran" } },
      ]),
    );
  });
});
