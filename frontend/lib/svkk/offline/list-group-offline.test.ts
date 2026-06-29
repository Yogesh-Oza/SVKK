import { describe, expect, it } from "vitest";
import type { OfflinePolicyListRow } from "./types";
import {
  buildOfflinePolicyListPage,
  mapCachedRowsToGroupedList,
} from "./list-group-offline";

function row(partial: Partial<OfflinePolicyListRow> & { id: string; svkkId: string }): OfflinePolicyListRow {
  return {
    id: partial.id,
    svkkId: partial.svkkId,
    policyNo: partial.policyNo ?? "PN",
    holderName: partial.holderName ?? "Holder",
    mobile: partial.mobile ?? null,
    email: partial.email ?? null,
    pan: partial.pan ?? null,
    village: partial.village ?? "Village",
    area: partial.area ?? null,
    yearLabel: partial.yearLabel ?? "2025-26",
    periodMonthText: partial.periodMonthText ?? "June",
    periodYearText: partial.periodYearText ?? "2025-26",
    customerId: partial.customerId ?? "C1",
    referenceNo: partial.referenceNo ?? "REF001",
    vkkPremium: partial.vkkPremium ?? "12000",
    sumInsured: partial.sumInsured ?? "500000",
    policyTypeId: partial.policyTypeId ?? "pt1",
    policyTypeName: partial.policyTypeName ?? "Family Floater",
    policyTypeKey: partial.policyTypeKey ?? "family_floater",
    categoryId: partial.categoryId ?? "cat1",
    categoryKey: partial.categoryKey ?? "B",
    categoryName: partial.categoryName ?? "Category B",
    categoryText: partial.categoryText ?? "Category B",
    remarks: partial.remarks ?? null,
    personsInsuredCount: partial.personsInsuredCount ?? 4,
    whatsappNo: partial.whatsappNo ?? null,
    policyGrouping: partial.policyGrouping ?? null,
    adProductVariant: partial.adProductVariant ?? null,
    createdAt: partial.createdAt ?? "2026-06-01T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-06-01T00:00:00.000Z",
    deletedAt: partial.deletedAt ?? null,
  };
}

describe("mapCachedRowsToGroupedList", () => {
  it("groups by SVKK ID with month, category, type, and premiums", () => {
    const grouped = mapCachedRowsToGroupedList([
      row({
        id: "p1",
        svkkId: "SVKK0614",
        policyNo: "PO81675560",
        holderName: "Vimala Manilal Gala",
        periodMonthText: "July",
        categoryName: "Category B",
        policyTypeName: "Family Floater",
        vkkPremium: "15000",
      }),
      row({
        id: "p2",
        svkkId: "SVKK0614",
        policyNo: "PO81675559",
        yearLabel: "2024-25",
        periodYearText: "2024-25",
        vkkPremium: "14000",
      }),
    ]);

    expect(grouped).toHaveLength(1);
    const item = grouped[0]!;
    expect(item.periodMonthText).toBe("July");
    expect(item.categoryText).toBe("Category B");
    expect(item.policyType.name).toBe("Family Floater");
    expect(item.years).toHaveLength(2);
    expect(item.years[0]?.vkkPremium).toBe("15000");
  });
});

describe("buildOfflinePolicyListPage", () => {
  it("filters by month and paginates grouped rows", () => {
    const page = buildOfflinePolicyListPage({
      rows: [
        row({ id: "p1", svkkId: "A", periodMonthText: "June" }),
        row({ id: "p2", svkkId: "B", periodMonthText: "July" }),
      ],
      filters: { periodMonths: ["June"] },
      sort: "createdAt",
      page: 1,
      pageSize: 50,
    });
    expect(page.total).toBe(1);
    expect(page.items[0]?.svkkPublicId).toBe("A");
  });
});
