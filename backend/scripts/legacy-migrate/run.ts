/**
 * Legacy MySQL → Prisma ETL CLI
 *
 *   DATABASE_URL=... DATABASE_URL_LEGACY=... tsx ... --dry-run
 *   DATABASE_URL=... LEGACY_DATABASE=techuico_insurance tsx ... --dry-run
 *   (After importing techuico_insurance.sql into that MySQL database — see README.)
 *
 * Apply mode uses lock file unless SKIP_LEGACY_MIGRATION_LOCK=1.
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { applyLegacyPolicyRowWithRetries } from "./apply-policy-row.js";
import {
  defaultChunkSize,
  defaultDbRetries,
  defaultProgressEveryN,
  defaultRetryDelayMs,
} from "./config/migration.js";
import { createLegacyPool, countOrphanMembers, countPolicyRows, fetchMembersForRefNos, fetchPolicyChunkKeyset } from "./legacy-db.js";
import { JsonlLogger } from "./logger.js";
import { acquireMigrationLock } from "./lock.js";
import type { DryRunMetrics, LegacyMemberRow, LegacyPolicyRow, MigrationLogLine } from "./types.js";
import { transformPolicyRow } from "./transform.js";
import { buildMigrationLookups, validatePolicyRowWithLookups } from "./validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string, fallback: string | undefined): string | undefined {
  const flag = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(flag));
  if (hit) return hit.slice(flag.length);
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1) return process.argv[i + 1];
  return fallback;
}

function emptyMetrics(): DryRunMetrics {
  return {
    totalPolicyRows: 0,
    wouldSucceed: 0,
    wouldSkip: 0,
    wouldFail: 0,
    missingMobile: 0,
    unknownPolicyType: 0,
    missingChart: 0,
    missingRefNo: 0,
    orphanMemberRowsInLegacy: 0,
    memberDobSentinelCount: 0,
    validationErrors: 0,
  };
}

function countValidationFailure(
  metrics: DryRunMetrics,
  code: "missingRefNo" | "unknownPolicyType" | "missingChart" | "validationErrors",
) {
  metrics.wouldSkip += 1;
  metrics[code] += 1;
}

/** Same server/credentials as DATABASE_URL, different database name (e.g. after mysql import of .sql dump). */
function legacyUrlFromBaseDatabaseUrl(databaseUrl: string, legacyDbName: string): string {
  const u = new URL(databaseUrl);
  u.pathname = `/${legacyDbName.replace(/^\//, "")}`;
  return u.href;
}

function resolveLegacyUrl(): string | null {
  const explicit = process.env.DATABASE_URL_LEGACY?.trim();
  if (explicit) return explicit;

  const legacyDb =
    argValue("legacy-db", undefined)?.trim() ||
    process.env.LEGACY_DATABASE?.trim() ||
    process.env.LEGACY_DATABASE_NAME?.trim();
  const base = process.env.DATABASE_URL?.trim();
  if (legacyDb && base) {
    try {
      return legacyUrlFromBaseDatabaseUrl(base, legacyDb);
    } catch {
      return null;
    }
  }
  return null;
}

async function main() {
  const dryRun = argFlag("dry-run") || !argFlag("apply");
  const apply = argFlag("apply");
  if (dryRun && apply) {
    console.error("Use either --dry-run or --apply, not both.");
    process.exit(1);
  }

  const chunkSize = Number(argValue("chunk-size", String(defaultChunkSize))) || defaultChunkSize;
  const limitRows = argValue("limit", undefined);
  const limit = limitRows ? Number(limitRows) : null;
  const logDir = argValue("log-dir", path.join(__dirname, "logs")) ?? path.join(__dirname, "logs");
  const verbose = argFlag("verbose");

  const targetUrl = process.env.DATABASE_URL;
  if (!targetUrl) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const legacyUrl = resolveLegacyUrl();
  if (!legacyUrl) {
    console.error(`
Missing legacy MySQL connection.

The ETL reads tables (policy_table, member) over MySQL — it does not open .sql files directly.

1) Import your dump into MySQL, e.g.:
   mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS techuico_insurance CHARACTER SET utf8mb4;"
   mysql -u root -p techuico_insurance < path/to/techuico_insurance.sql

2) Then either:
   - Set DATABASE_URL_LEGACY="mysql://user:pass@host:3306/techuico_insurance"
   - Or set LEGACY_DATABASE=techuico_insurance (same host/user/password as DATABASE_URL)

Optional CLI: --legacy-db=techuico_insurance
`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const lookups = await buildMigrationLookups(prisma);
  const pool = createLegacyPool(legacyUrl);
  const metrics = emptyMetrics();
  metrics.totalPolicyRows = await countPolicyRows(pool);
  metrics.orphanMemberRowsInLegacy = await countOrphanMembers(pool);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(logDir, `migration-${ts}.jsonl`);
  const logger = new JsonlLogger(logPath);

  let releaseLock: (() => Promise<void>) | null = null;
  if (!dryRun && process.env.SKIP_LEGACY_MIGRATION_LOCK !== "1") {
    const lockPath = path.join(__dirname, ".migration.lock");
    releaseLock = await acquireMigrationLock(lockPath);
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "DRY_RUN" : "APPLY",
        totalPolicyRows: metrics.totalPolicyRows,
        orphanMemberRowsInLegacy: metrics.orphanMemberRowsInLegacy,
        logFile: logPath,
        chunkSize,
        limit,
      },
      null,
      2,
    ),
  );

  let processed = 0;
  let lastRefNo: string | null = null;
  let stopAll = false;
  let interrupted = false;
  process.once("SIGINT", () => {
    interrupted = true;
    console.error(
      "\n[legacy-migrate] Interrupt received — finishing current row, then printing partial summary.\n",
    );
  });

  console.error(
    `[legacy-migrate] ${dryRun ? "Dry-run" : "Apply"}: processing up to ${metrics.totalPolicyRows} policy rows (see JSON summary when done)…`,
  );

  try {
    while (!stopAll && !interrupted) {
      const chunk: LegacyPolicyRow[] = await fetchPolicyChunkKeyset(pool, lastRefNo, chunkSize);
      if (chunk.length === 0) break;

      const refNos = chunk.map((r) => String(r.ref_no).trim());
      const allMembers = await fetchMembersForRefNos(pool, refNos);
      const membersByRef = new Map<string, LegacyMemberRow[]>();
      for (const m of allMembers) {
        const r = m.ref_no?.trim();
        if (!r) continue;
        const list = membersByRef.get(r) ?? [];
        list.push(m);
        membersByRef.set(r, list);
      }

      for (const row of chunk) {
        if (interrupted) {
          stopAll = true;
          break;
        }
        if (limit != null && processed >= limit) {
          stopAll = true;
          break;
        }
        lastRefNo = String(row.ref_no).trim();
        processed++;

        const members = membersByRef.get(lastRefNo) ?? [];

        const logBase = {
          refNo: lastRefNo,
          warnings: [] as string[],
        };

        const validation = validatePolicyRowWithLookups(row, lookups);
        if (!validation.ok) {
          const errType: MigrationLogLine["errorType"] =
            validation.code === "missingRefNo" || validation.code === "validationErrors"
              ? "VALIDATION_ERROR"
              : validation.code === "unknownPolicyType"
                ? "MAPPING_ERROR"
                : "SKIPPED_REASON";

          countValidationFailure(
            metrics,
            validation.code === "unknownPolicyType"
              ? "unknownPolicyType"
              : validation.code === "missingChart"
                ? "missingChart"
                : validation.code === "missingRefNo"
                  ? "missingRefNo"
                  : "validationErrors",
          );

          logger.write({
            ...logBase,
            status: "SKIPPED",
            errorType: errType,
            reason: validation.reason,
            warnings: [],
            ...(verbose ? { rawData: row as unknown as Record<string, unknown> } : {}),
          });
        } else {
          const t = transformPolicyRow(row);
          if (t.usedSyntheticMobile) metrics.missingMobile += 1;

          if (dryRun) {
            metrics.wouldSucceed += 1;
            let sentinel = 0;
            for (const m of members) {
              const d = m.dob;
              const ds = d == null ? "" : String(d);
              if (!ds || ds.startsWith("0000-00")) sentinel += 1;
            }
            metrics.memberDobSentinelCount += sentinel;

            logger.write({
              ...logBase,
              status: "SUCCESS",
              errorType: null,
              reason: "dry_run_ok",
              warnings: t.usedSyntheticMobile ? ["SYNTHETIC_MOBILE"] : [],
            });
          } else {
            try {
              const result = await applyLegacyPolicyRowWithRetries(
                prisma,
                row,
                members,
                validation.targets,
                defaultDbRetries,
                defaultRetryDelayMs,
              );

              metrics.wouldSucceed += 1;
              metrics.memberDobSentinelCount += result.memberDobSentinelCount;

              logger.write({
                ...logBase,
                status: "SUCCESS",
                errorType: null,
                reason: null,
                warnings: [...new Set([...result.warnings, ...(t.usedSyntheticMobile ? ["SYNTHETIC_MOBILE"] : [])])],
              });
            } catch (e) {
              metrics.wouldFail += 1;
              const reason = e instanceof Error ? e.message : String(e);
              logger.write({
                ...logBase,
                status: "FAILED",
                errorType: "DB_ERROR",
                reason,
                warnings: [],
                ...(verbose ? { rawData: row as unknown as Record<string, unknown> } : {}),
              });
            }
          }
        }

        if (processed % defaultProgressEveryN === 0) {
          console.error(`Progress: processed ${processed} rows (last ref_no=${lastRefNo})`);
        }
      }

      if (stopAll) break;
      if (chunk.length < chunkSize) break;
      lastRefNo = chunk[chunk.length - 1]!.ref_no.trim();
    }
  } finally {
    if (releaseLock) await releaseLock();
    await logger.end();
    await pool.end();
    await prisma.$disconnect();
  }

  const finalPayload = {
    rowsProcessed: processed,
    interrupted,
    summary: metrics,
    logFile: logPath,
  };
  console.log(JSON.stringify(finalPayload, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
