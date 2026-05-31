import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  ClaimLinkMode,
  CsvImportMode,
  PrismaClient,
} from "@prisma/client";
import { loadMisScope } from "../src/services/mis-scope.service.js";
import { loadClaimStatusMap } from "../src/modules/claim/claim-status-map.js";
import { buildClaimImportTypeCache } from "../src/modules/claim/claim-policy-match.js";
import {
  importClaimRow,
  parseClaimRow,
} from "../src/modules/claim/claim-csv-import.js";
import {
  claimRowToMap,
  parseClaimFile,
} from "../src/modules/claim/claim-csv-parse.js";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const csvPath = join(__dirname, "../fixtures/claim-import-test-sample.csv");
  const buffer = await readFile(csvPath);

  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    include: { rbacRole: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!user) throw new Error("No user in database");

  const permissions = new Set(
    user.rbacRole?.permissions.map((rp) => rp.permission.key) ?? ["*:*"],
  );
  if (!permissions.size) permissions.add("*:*");

  const scope = await loadMisScope(user.id, permissions, "claim");
  const statusMap = await loadClaimStatusMap();
  const typeCache = await buildClaimImportTypeCache();

  const { header, dataRows } = await parseClaimFile(buffer, "claim-import-test-sample.csv");
  const parsedRows = dataRows.map((row, i) =>
    parseClaimRow(i + 2, claimRowToMap(header, row), statusMap),
  );

  let created = 0;
  let failed = 0;

  for (const row of parsedRows) {
    const outcome = await importClaimRow(row, {
      typeCache,
      linkMode: ClaimLinkMode.STRICT_MATCH,
      importMode: CsvImportMode.CREATE_ONLY,
      dryRun: false,
      userId: user.id,
      permissions,
      scope,
      statusMap,
    });
    if (outcome.result === "created") {
      created++;
      console.log("OK", row.claimNo, row.policyNo, outcome.matchStatus);
    } else {
      failed++;
      console.error("FAIL", row.claimNo, outcome.error?.error, outcome.matchStatus);
    }
  }

  console.log(`\nDone: ${created} created, ${failed} failed (${parsedRows.length} rows)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
