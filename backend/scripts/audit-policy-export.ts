/**
 * Audit CSV export for a single policy. Usage:
 *   npx tsx scripts/audit-policy-export.ts "PO- 14010061252700000246"
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadCategoryByKeyMap } from "../src/lib/category-display.js";
import { POLICY_CSV_FLAT_HEADERS } from "../src/modules/policy/policy-csv-flat-headers.js";
import { buildPolicyCsvHeadersForExport } from "../src/modules/policy/policy-csv-export-layout.js";
import {
  buildLegacyPoliciesCsv,
  buildLegacyPolicyCsvCells,
} from "../src/modules/policy/policy-csv-format.js";
import { parseCsv, rowToHeaderMap } from "../src/modules/policy/policy-csv-parse.js";
import {
  pickExportPolicyYear,
  queryPolicyListForExport,
  type PolicyExportRow,
} from "../src/modules/policy/policy.export-csv.js";

const policyNoArg = process.argv[2]?.trim() ?? "PO- 14010061252700000246";

function isBlank(v: string | undefined): boolean {
  if (v == null) return true;
  const t = v.trim();
  return t === "" || t === "—";
}

async function main() {
  const rows = await queryPolicyListForExport({
    where: { policyNo: policyNoArg },
    sort: undefined,
  });

  if (!rows.length) {
    const fuzzy = await queryPolicyListForExport({
      where: { policyNo: { contains: "14010061252700000246" } },
      sort: undefined,
    });
    if (!fuzzy.length) {
      console.error(`No policy found for policyNo=${JSON.stringify(policyNoArg)}`);
      process.exit(1);
    }
    console.warn(`Exact match failed; using ${fuzzy.length} fuzzy match(es)`);
    rows.push(...fuzzy);
  }

  const row = rows[0]!;
  const categoryByKey = await loadCategoryByKeyMap();
  const permissions = new Set(["policy:scope_all", "policy:read"]);
  const year = pickExportPolicyYear(row.years, []);
  const headers = buildPolicyCsvHeadersForExport(
    year?.members?.length ?? 0,
    year?.payments?.length ?? 0,
  );
  const cells = buildLegacyPolicyCsvCells(row, row.insuredParty, year, categoryByKey, headers);
  const csv = buildLegacyPoliciesCsv([row], [row.insuredParty], [year], categoryByKey);

  const exportsDir = join(process.cwd(), "..", "exports");
  mkdirSync(exportsDir, { recursive: true });
  const safeName = policyNoArg.replace(/[^\w-]+/g, "_").replace(/_+/g, "_");
  const outPath = join(exportsDir, `${safeName}-policy-export.csv`);
  writeFileSync(outPath, csv, "utf8");

  const parsed = parseCsv(csv.replace(/^\uFEFF/, ""));
  const header = parsed[0] ?? [];
  const data = parsed[1] ?? [];
  const map = rowToHeaderMap(header, data);

  const expectedFlat = [...POLICY_CSV_FLAT_HEADERS];
  const missingHeaders = expectedFlat.filter((h) => !header.includes(h));
  const orderOk = header.slice(0, expectedFlat.length).every((h, i) => h === expectedFlat[i]);

  const empty: string[] = [];
  const filled: string[] = [];
  for (const h of expectedFlat) {
    const v = map.get(h) ?? "";
    if (isBlank(v)) empty.push(h);
    else filled.push(h);
  }

  console.log(`Policy: ${row.policyNo} (id=${row.id})`);
  console.log(`Year: ${year?.yearLabel ?? "—"} members=${year?.members?.length ?? 0} payments=${year?.payments?.length ?? 0}`);
  console.log(`CSV written: ${outPath}`);
  console.log(`Header count: ${header.length} (flat=${expectedFlat.length})`);
  console.log(`Flat order OK: ${orderOk}`);
  if (missingHeaders.length) console.log("Missing headers:", missingHeaders);
  console.log(`\nFilled (${filled.length}):`);
  for (const h of filled) console.log(`  ✓ ${h}: ${(map.get(h) ?? "").slice(0, 60)}`);
  console.log(`\nEmpty (${empty.length}):`);
  for (const h of empty) console.log(`  ✗ ${h}`);

  if (year && empty.length) {
    dumpDbHints(row, year, empty);
  }

  process.exit(empty.length && missingHeaders.length === 0 && orderOk ? 1 : 0);
}

function dumpDbHints(row: PolicyExportRow, year: NonNullable<PolicyExportRow["years"][number]>, empty: string[]) {
  console.log("\n--- DB hints for empty columns ---");
  const premiumKeys = new Set([
    "Gross premium",
    "Tax %",
    "Tax amount",
    "SVKK premium",
    "Net premium",
    "VKK commission",
    "Commission amount",
    "Policy Holder Premium",
    "Two lac floater",
    "Gaam mahajan contribution",
    "Excess / short",
    "Diff paid by holder",
  ]);
  if (empty.some((h) => premiumKeys.has(h))) {
    console.log("PolicyYear premium:", {
      grossPremium: year.grossPremium?.toString(),
      taxPercent: year.taxPercent?.toString(),
      taxAmount: year.taxAmount?.toString(),
      svkkPremium: year.svkkPremium?.toString(),
      vkkPremium: year.vkkPremium?.toString(),
      netPremium: year.netPremium?.toString(),
      expectedNetPremium: year.expectedNetPremium?.toString(),
      vkkCommission: year.vkkCommission?.toString(),
      commissionAmount: year.commissionAmount?.toString(),
      yearPolicyHolderPremium: year.yearPolicyHolderPremium?.toString(),
      policyHolderContribution: year.policyHolderContribution?.toString(),
      twoLacFloater: year.twoLacFloater?.toString(),
      premiumOneOrTwoLakh: year.premiumOneOrTwoLakh?.toString(),
      gaamMahajanContribution: year.gaamMahajanContribution?.toString(),
      gaamMahajanVkk: year.gaamMahajanVkk?.toString(),
      excessShortAmount: year.excessShortAmount?.toString(),
      diffPaidByHolder: year.diffPaidByHolder?.toString(),
      differenceAmountPaidByHolder: year.differenceAmountPaidByHolder?.toString(),
    });
  }
  if (empty.includes("Holder gender")) {
    console.log("holderGender:", row.holderGender);
  }
  if (empty.some((h) => h.startsWith("Member 1"))) {
    console.log(
      "members[0]:",
      year.members[0]
        ? {
            name: year.members[0].name,
            relationship: year.members[0].relationship,
          }
        : "none",
    );
  }
  const pay = year.payments[0];
  if (empty.some((h) => ["mode of payment", "policy_cheque_no", "bank"].includes(h)) && pay) {
    console.log("payments[0]:", {
      method: pay.method,
      paymentMode: year.paymentMode,
      transactionNumber: pay.transactionNumber,
      cheque: pay.cheque,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
