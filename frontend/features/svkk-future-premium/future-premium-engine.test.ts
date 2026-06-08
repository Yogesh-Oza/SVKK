import { describe, expect, it } from "vitest";

import { SAMPLE_CHARTS, SAMPLE_DEFS } from "../../lib/svkk/premium/sample-data";
import type { PremiumState } from "../../lib/svkk/premium/types";
import {
  buildFutureResults,
  computeFutureMis,
  filterFutureResults,
  findLookupResult,
  normalizeLookupToken,
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
});
