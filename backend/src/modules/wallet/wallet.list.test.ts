import { describe, expect, it } from "vitest";
import { buildWalletTxnWhere } from "./wallet.list.js";

describe("buildWalletTxnWhere", () => {
  it("filters by type, village, group, month, year, and policyId", () => {
    const where = buildWalletTxnWhere("w1", {
      type: "DEBIT",
      village: "Bhachau",
      group: "SVKK",
      month: "6",
      year: "2026",
      policyId: "pol-1",
      category: "A",
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
