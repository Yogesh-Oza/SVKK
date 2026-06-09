import { describe, expect, it } from "vitest";

import { SAMPLE_CHARTS, SAMPLE_DEFS } from "../../lib/svkk/premium/sample-data";
import type { PremiumState } from "../../lib/svkk/premium/types";
import { buildMembersFromFutureRow, detectMemberSlotCount } from "./future-csv-utils";
import {
  buildFutureResults,
  computeFutureMis,
  filterFutureResults,
  findLookupResult,
  normalizeLookupToken,
  pickBestLookupMatch,
  policyYearSortKey,
  yearOffsetLabel,
} from "./future-premium-engine";
import { FUTURE_PREMIUM_SAMPLE_ROWS } from "./future-premium-export";

const premiumState: PremiumState = {
  charts: SAMPLE_CHARTS,
  defs: SAMPLE_DEFS,
};

describe("future-premium-engine", () => {
  it("builds three sample future results for current year", () => {
    const rows = FUTURE_PREMIUM_SAMPLE_ROWS.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])),
    );
    const results = buildFutureResults(rows, "uploaded_csv_only", "0", premiumState);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "Ready")).toBe(true);
    expect(results[0]?.quote.net).toBeGreaterThan(0);
  });

  it("aggregates MIS by policy type and SI", () => {
    const rows = FUTURE_PREMIUM_SAMPLE_ROWS.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])),
    );
    const results = buildFutureResults(rows, "uploaded_csv_only", "0", premiumState);
    const mis = computeFutureMis(results);
    expect(mis.policies).toBe(3);
    expect(mis.members).toBe(8);
    expect(Object.keys(mis.byType).length).toBe(3);
    expect(Object.keys(mis.bySI).length).toBe(3);
  });

  it("filters results by search token", () => {
    const rows = FUTURE_PREMIUM_SAMPLE_ROWS.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])),
    );
    const results = buildFutureResults(rows, "uploaded_csv_only", "0", premiumState);
    const filtered = filterFutureResults(results, "SVKK1002", "all", "all", "all");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.holder).toBe("Manoj Shah");
  });

  it("finds lookup by normalized policy number", () => {
    const rows = FUTURE_PREMIUM_SAMPLE_ROWS.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])),
    );
    const found = findLookupResult("pol1001", rows, "linked_upload", "0", premiumState);
    expect(found?.svkkId).toBe("SVKK1001");
    expect(normalizeLookupToken("POL-1001")).toBe("pol1001");
  });

  it("finds lookup when PO prefix spacing differs", () => {
    const row = {
      "policy no": "PO- 14010061252800000651",
      svkk_id: "SVKK9999",
      customer_id: "CUST1",
      holder_name: "Test Holder",
      policy_type: "family floater",
      sum_insured: "200000",
      start_date: "2025-06-01",
      end_date: "2026-05-31",
      member_count: "2",
    };
    const found = findLookupResult(
      "PO-14010061252800000651",
      [row],
      "policy_list_only",
      "0",
      premiumState,
    );
    expect(found?.policyNo).toBe("PO- 14010061252800000651");
    expect(found?.svkkId).toBe("SVKK9999");
  });

  it("labels year offsets", () => {
    expect(yearOffsetLabel("0")).toBe("Current Year");
    expect(yearOffsetLabel("1")).toBe("Next Year");
    expect(yearOffsetLabel("3")).toBe("3 Yr");
    expect(yearOffsetLabel("10")).toBe("10 Yr");
  });

  it("orders fiscal year labels for latest-first selection", () => {
    expect(policyYearSortKey("2026-27")).toBeGreaterThan(policyYearSortKey("2025-26"));
  });

  it("parses Member 2 slot columns from policy export shape", () => {
    const row = {
      "Holder name": "Krina Ishwar Nishar",
      "Holder DOB": "27-07-1992",
      "Holder gender": "Female",
      "Person Count*": "2",
      "Member 1 Name": "Krina Ishwar Nishar",
      "Member 1 DOB": "27-07-1992",
      "Member 1 Gender": "Female",
      "Member 2 Name": "Ishwar K. Nishar",
      "Member 2 DOB": "04-05-1981",
      "Member 2 Relationship": "Spouse",
      "Member 2 Gender": "Female",
      policy_type: "family floater",
    };
    expect(detectMemberSlotCount(row)).toBe(2);
    const members = buildMembersFromFutureRow(row, "family_floater", 0);
    expect(members).toHaveLength(2);
    expect(members[1]?.name).toBe("Ishwar K. Nishar");
    expect(members[0]?.gender).toBe("female");
  });

  it("picks latest year when searching a legacy policy number carried forward", () => {
    const older = {
      "policy no": "PO- 14010061252800000652",
      svkk_id: "RTYJUNE0002",
      customer_id: "PO50864896",
      holder_name: "Krina Ishwar Nishar",
      policy_type: "family floater",
      sum_insured: "200000",
      start_date: "2025-06-16",
      end_date: "2026-06-15",
      year: "2025-26",
      "Person Count*": "2",
      "Holder gender": "Female",
      "Member 1 Name": "Krina Ishwar Nishar",
      "Member 1 DOB": "1992-07-27",
    };
    const newer = {
      ...older,
      "policy no": "",
      "previous policy no": "PO- 14010061252800000652",
      start_date: "2026-06-16",
      end_date: "2027-06-15",
      year: "2026-27",
      "Member 2 Name": "Ishwar K. Nishar",
      "Member 2 DOB": "1981-05-04",
      "Member 2 Relationship": "Spouse",
      "Member 2 Gender": "Female",
    };
    const found = findLookupResult(
      "PO- 14010061252800000652",
      [older, newer],
      "policy_list_only",
      "0",
      premiumState,
    );
    expect(found?.details.year).toBe("2026-27");
    expect(found?.quote.rows.length).toBe(2);
  });

  it("picks latest policy year when SVKK ID matches multiple export rows", () => {
    const older = {
      svkk_id: "RTYJUNE0002",
      customer_id: "PO50864896",
      holder_name: "Krina Ishwar Nishar",
      policy_type: "family floater",
      sum_insured: "200000",
      start_date: "2025-06-16",
      end_date: "2026-06-15",
      year: "2025-26",
      member_count: "2",
      "member 1 name": "Krina Ishwar Nishar",
      "member 1 dob": "1992-07-27",
      "holder gender": "female",
    };
    const newer = {
      ...older,
      start_date: "2026-06-16",
      end_date: "2027-06-15",
      year: "2026-27",
      "previous policy no": "PO- 14010061252800000652",
      "member 2 name": "Ishwar K. Nishar",
      "member 2 dob": "1981-05-04",
      "member 2 relationship": "spouse",
      "member 2 gender": "female",
    };
    const found = findLookupResult(
      "RTYJUNE0002",
      [older, newer],
      "policy_list_only",
      "0",
      premiumState,
    );
    expect(found?.details.year).toBe("2026-27");
    expect(found?.quote.rows.length).toBe(2);
  });

  it("honours suggestion year when user picks a specific fiscal year", () => {
    const older = {
      svkk_id: "RTYJUNE0002",
      customer_id: "PO50864896",
      holder_name: "Krina Ishwar Nishar",
      policy_type: "family floater",
      sum_insured: "200000",
      start_date: "2025-06-16",
      end_date: "2026-06-15",
      year: "2025-26",
      member_count: "1",
      "member 1 name": "Krina Ishwar Nishar",
      "member 1 dob": "1992-07-27",
    };
    const newer = { ...older, year: "2026-27", end_date: "2027-06-15" };
    const built = buildFutureResults([older, newer], "policy_list_only", "0", premiumState);
    const picked = pickBestLookupMatch(built, "2025-26");
    expect(picked?.details.year).toBe("2025-26");
  });
});
