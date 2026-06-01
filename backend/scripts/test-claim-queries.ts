import { PrismaClient } from "@prisma/client";
import { buildClaimScopeSqlC, queryClaimReport } from "../src/modules/mis/claim-mis.queries.js";

const prisma = new PrismaClient();

async function main() {
  const permissions = new Set(["*:*"]);
  const scope = { kind: "full" as const };
  const scopeSql = buildClaimScopeSqlC(permissions, scope, []);
  const filters = {
    dateFrom: null,
    dateTo: new Date(),
    villages: [],
    categoryKeys: [],
    policyGroupings: [],
    areas: [],
    sumInsureds: [],
    periodMonthTexts: [],
    fiscalLabels: [],
  };

  const rows = await queryClaimReport(prisma, {
    scopeSql,
    filters,
    groupBy: "village",
  });
  console.log("claim report rows:", rows.length, rows.slice(0, 3));

  const { distinctClaimFilterOptions } = await import("../src/modules/claim/claim.list.js");
  const opts = await distinctClaimFilterOptions({});
  console.log("filter options:", opts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
