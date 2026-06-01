import { prisma } from "./prisma.js";

const CLAIM_CSV_COLUMN = "deductionAmount";

const SETUP_HINT =
  `Claim table is missing columns from migration 20260531120000_claim_csv_import (e.g. ${CLAIM_CSV_COLUMN}). ` +
  "Run: npm run db:deploy";

/** Fail fast when claim CSV import migration was not applied to the connected database. */
export async function assertClaimSchemaReady(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'claim'
       AND COLUMN_NAME = '${CLAIM_CSV_COLUMN}'`,
  );
  if (Number(rows[0]?.cnt ?? 0) === 0) {
    throw new Error(SETUP_HINT);
  }
}

export { SETUP_HINT as CLAIM_SCHEMA_SETUP_HINT };
