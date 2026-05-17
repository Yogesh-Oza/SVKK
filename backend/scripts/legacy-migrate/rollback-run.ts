/**
 * Roll back a legacy migration run by migrationRunId.
 *
 *   npm run legacy-migrate:rollback -- --run-id=<id> --confirm
 *   npm run legacy-migrate:rollback -- --run-id=<id> --dry-run
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { rollbackMigrationRun } from "./rollback.js";

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string): string | undefined {
  const flag = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(flag));
  if (hit) return hit.slice(flag.length);
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1) return process.argv[i + 1];
  return undefined;
}

async function main() {
  const runId = argValue("run-id")?.trim();
  if (!runId) {
    console.error("Usage: --run-id=<migrationRunId> [--dry-run] [--confirm]");
    process.exit(1);
  }

  const dryRun = argFlag("dry-run");
  if (!dryRun && !argFlag("confirm")) {
    console.error("Pass --confirm to execute rollback, or --dry-run to preview counts.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const counts = await rollbackMigrationRun(prisma, runId, dryRun);
    console.log(JSON.stringify({ runId, dryRun, counts }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
