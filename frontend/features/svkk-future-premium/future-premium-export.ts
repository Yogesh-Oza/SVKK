import type { CsvRowObject, FuturePremiumResult } from "./future-premium-types";

function buildCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const heads = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = ["\uFEFF" + heads.join(",")];
  for (const r of rows) {
    const line = heads
      .map((h) => {
        const t = String(r[h] ?? "");
        return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
      })
      .join(",");
    lines.push(line);
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): boolean {
  const csv = buildCsv(rows);
  if (!csv) return false;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
  return true;
}

export function summaryExportRows(results: FuturePremiumResult[]): Record<string, unknown>[] {
  const rows = results.map((r) => ({
    policy_number: r.policyNo,
    holder_name: r.holder,
    policy_type: r.futurePolicy,
    current_policy_type: r.currentPolicy,
    future_policy_type: r.futurePolicy,
    sum_insured: r.futureSi,
    current_sum_insured: r.currentSi,
    future_sum_insured: r.futureSi,
    member_count: r.memberCount,
    start_date: r.context.futureStartDate,
    end_date: r.context.futureEndDate,
    calculation_date: r.calcDate,
    calculation_year: r.calcYear,
    current_policy_year: r.context.currentPolicyYear,
    future_policy_year: r.context.futurePolicyYear,
    current_basic_premium: r.currentQuote.basic,
    future_basic_premium: r.quote.basic,
    current_gross_premium: r.currentQuote.gross,
    future_gross_premium: r.quote.gross,
    current_discount: r.currentQuote.disc,
    future_discount: r.quote.disc,
    current_net_premium: r.currentQuote.net,
    future_net_premium: r.quote.net,
    difference: r.premiumDiff,
    increase_percent: r.premiumIncreasePct,
    reason: r.reasons.join("; "),
    status: r.status,
  }));
  if (!rows.length) return rows;
  const totalIncrease = results.reduce((sum, r) => sum + r.premiumDiff, 0);
  rows.push({
    policy_number: "TOTAL",
    holder_name: "",
    future_net_premium: results.reduce((sum, r) => sum + r.futurePremium, 0),
    current_net_premium: results.reduce((sum, r) => sum + r.currentPremium, 0),
    difference: totalIncrease,
    increase_percent: "",
    reason: "Total Increase",
    status: "",
  });
  return rows;
}

export function detailExportRows(results: FuturePremiumResult[]): Record<string, unknown>[] {
  const rows = results.flatMap((r) =>
    r.memberTimeline.map((m) => ({
      svkk_id: r.svkkId,
      customer_id: r.customerId,
      policy_number: r.policyNo,
      holder_name: r.holder,
      current_policy_type: r.currentPolicy,
      future_policy_type: r.futurePolicy,
      current_sum_insured: r.currentSi,
      future_sum_insured: r.futureSi,
      member_count: r.memberCount,
      person_name: m.name,
      role: m.role,
      relationship: m.relationship,
      gender: m.gender,
      dob: m.dob,
      current_age: m.currentAge ?? "",
      future_age: m.futureAge ?? "",
      current_band: m.currentBand,
      future_band: m.futureBand,
      current_basic_premium: m.currentBasic,
      future_basic_premium: m.futureBasic,
      current_gross_premium: m.currentGross,
      future_gross_premium: m.futureGross,
      current_discount_amount: m.currentDisc,
      future_discount_amount: m.futureDisc,
      current_net_premium: m.currentNet,
      future_net_premium: m.futureNet,
      difference: m.deltaNet,
      increase_percent: m.deltaPct,
      calculation_date: r.calcDate,
      calculation_year: r.calcYear,
      status: m.issue || "Ready",
    })),
  );
  if (!rows.length) return rows;
  rows.push({
    policy_number: "TOTAL",
    person_name: "",
    current_net_premium: results.reduce((sum, r) => sum + r.currentPremium, 0),
    future_net_premium: results.reduce((sum, r) => sum + r.futurePremium, 0),
    difference: results.reduce((sum, r) => sum + r.premiumDiff, 0),
    increase_percent: "",
    status: "",
  });
  return rows;
}

/** Built-in demo rows for Future Premium (also used by “Load sample” in the UI). */
export function futurePremiumSampleCsvRows(): CsvRowObject[] {
  return FUTURE_PREMIUM_SAMPLE_ROWS.map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? "")])),
  );
}

export const FUTURE_PREMIUM_SAMPLE_ROWS: Record<string, unknown>[] = [
  {
    svkk_id: "SVKK1001",
    customer_id: "CUST1001",
    policy_number: "POL1001",
    policy_type: "asha_kiran",
    sum_insured: 500000,
    member_count: 3,
    start_date: "2025-10-15",
    end_date: "2026-10-14",
    holder_name: "Kiran Nishar",
    holder_dob: "1987-10-13",
    holder_gender: "male",
    holder_addon_rider: 0,
    member_2_name: "Priya Nishar",
    member_2_dob: "1990-06-05",
    member_2_relationship: "spouse",
    member_2_gender: "female",
    member_2_addon_rider: 0,
    member_3_name: "Riya Nishar",
    member_3_dob: "2014-08-11",
    member_3_relationship: "daughter",
    member_3_gender: "female",
    member_3_addon_rider: 0,
  },
  {
    svkk_id: "SVKK1002",
    customer_id: "CUST1002",
    policy_number: "POL1002",
    policy_type: "individual",
    sum_insured: 1000000,
    member_count: 1,
    start_date: "2025-07-01",
    end_date: "2026-06-30",
    holder_name: "Manoj Shah",
    holder_dob: "1978-02-18",
    holder_gender: "male",
    holder_addon_rider: 250,
  },
  {
    svkk_id: "SVKK1003",
    customer_id: "CUST1003",
    policy_number: "POL1003",
    policy_type: "family_floater",
    sum_insured: 300000,
    member_count: 4,
    start_date: "2025-04-01",
    end_date: "2026-03-31",
    holder_name: "Harsh Mehta",
    holder_dob: "1981-04-02",
    holder_gender: "male",
    holder_addon_rider: 0,
    member_2_name: "Pooja Mehta",
    member_2_dob: "1984-09-15",
    member_2_relationship: "spouse",
    member_2_gender: "female",
    member_2_addon_rider: 0,
    member_3_name: "Aarav Mehta",
    member_3_dob: "2012-01-20",
    member_3_relationship: "son",
    member_3_gender: "male",
    member_3_addon_rider: 0,
    member_4_name: "Diya Mehta",
    member_4_dob: "2016-12-05",
    member_4_relationship: "daughter",
    member_4_gender: "female",
    member_4_addon_rider: 0,
  },
];
