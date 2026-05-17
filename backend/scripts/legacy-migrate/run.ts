/**
 * Legacy MySQL → Prisma ETL CLI (masters → policies → reconcile)
 */
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MigrationPhase, MigrationRunMode, MigrationRunStatus, PrismaClient } from "@prisma/client";
import { applyLegacyPolicyRowWithRetries } from "./apply-policy-row.js";
import { saveCheckpoint, loadCheckpointRefNo } from "./checkpoint.js";
import {
  CURRENT_VERSION,
  defaultChunkSize,
  defaultDbRetries,
  defaultProgressEveryN,
  defaultRetryDelayMs,
  migrationVersion,
} from "./config/migration.js";
import { DropdownResolver } from "./dropdown-resolver.js";
import {
  countOrphanMembers,
  countPolicyRows,
  createLegacyPool,
  fetchMembersForRefNos,
  fetchPolicyByRefNo,
  fetchPolicyChunkKeyset,
} from "./legacy-db.js";
import { JsonlLogger } from "./logger.js";
import { acquireMigrationLock } from "./lock.js";
import { migrateMasters } from "./migrate-masters.js";
import { enqueueFailedRow, resolveFailedRow, writeMigrationLog } from "./migration-db-log.js";
import { persistReconciliationAudit, runReconciliation } from "./reconcile.js";
import {
  assertNoConflictingActiveRun,
  assertVersionMatch,
  forceDeactivateRun,
  unlockStaleRuns,
} from "./run-migration-guard.js";
import { resolvePolicyDropdownFields, transformPolicyRow } from "./transform.js";
import type { DryRunMetrics, LegacyMemberRow, LegacyPolicyRow, MigrationLogLine } from "./types.js";
import {
  buildMigrationLookups,
  checkBusinessDuplicates,
  validatePolicyRowWithLookups,
} from "./validate.js";

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
    unmatchedCreated: 0,
    paymentsCreated: 0,
    chequesCreated: 0,
    receiptsCreated: 0,
    duplicateWarnings: 0,
  };
}

function countValidationFailure(
  metrics: DryRunMetrics,
  code: "missingRefNo" | "unknownPolicyType" | "missingChart" | "validationErrors",
) {
  metrics.wouldSkip += 1;
  metrics[code] += 1;
}

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

function legacyDbNameFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "") || "legacy";
  } catch {
    return "legacy";
  }
}

async function createMigrationRun(
  prisma: PrismaClient,
  apply: boolean,
  legacyDbName: string,
  chunkSize: number,
): Promise<string> {
  const run = await prisma.migrationRun.create({
    data: {
      migrationVersion: CURRENT_VERSION,
      mode: apply ? MigrationRunMode.apply : MigrationRunMode.dry_run,
      status: MigrationRunStatus.running,
      isActive: apply,
      legacyDbName,
      chunkSize,
      cliArgs: process.argv.slice(2),
    },
  });
  return run.id;
}

async function finishMigrationRun(
  prisma: PrismaClient,
  runId: string,
  status: MigrationRunStatus,
): Promise<void> {
  await prisma.migrationRun.update({
    where: { id: runId },
    data: { status, isActive: false, finishedAt: new Date() },
  });
}

async function processPolicyChunks(options: {
  prisma: PrismaClient;
  pool: ReturnType<typeof createLegacyPool>;
  migrationRunId: string;
  apply: boolean;
  dryRun: boolean;
  chunkSize: number;
  limit: number | null;
  afterRefNo: string | null;
  skipMasters: boolean;
  lookups: Awaited<ReturnType<typeof buildMigrationLookups>>;
  resolver: DropdownResolver;
  logger: JsonlLogger;
  metrics: DryRunMetrics;
  verbose: boolean;
  failFast: boolean;
  interruptRef: { value: boolean };
}): Promise<{ processed: number; lastRefNo: string | null; interrupted: boolean }> {
  const {
    prisma,
    pool,
    migrationRunId,
    apply,
    dryRun,
    chunkSize,
    limit,
    lookups,
    resolver,
    logger,
    metrics,
    verbose,
    failFast,
  } = options;

  let processed = 0;
  let lastRefNo = options.afterRefNo;
  let stopAll = false;
  const progressEvery = apply ? 10 : defaultProgressEveryN;

  while (!stopAll && !options.interruptRef.value) {
    const chunk = await fetchPolicyChunkKeyset(pool, lastRefNo, chunkSize);
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
      if (options.interruptRef.value) {
        stopAll = true;
        break;
      }
      if (limit != null && processed >= limit) {
        stopAll = true;
        break;
      }

      const refNo = String(row.ref_no).trim();
      lastRefNo = refNo;
      processed++;
      const members = membersByRef.get(refNo) ?? [];
      const logBase = { refNo, warnings: [] as string[], migrationRunId };

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
        if (apply) {
          await writeMigrationLog(prisma, migrationRunId, {
            refNo,
            entity: "policy",
            status: "SKIPPED",
            errorType: errType,
            reason: validation.reason,
            warnings: [],
          });
        }
        continue;
      }

      let t;
      try {
        t = transformPolicyRow(row);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        metrics.wouldFail += 1;
        logger.write({
          ...logBase,
          status: "FAILED",
          errorType: "VALIDATION_ERROR",
          reason,
          warnings: [],
        });
        if (apply) {
          await enqueueFailedRow(prisma, migrationRunId, refNo, MigrationPhase.policies, "VALIDATION_ERROR", reason);
        }
        if (failFast) throw e;
        continue;
      }

      if (t.usedSyntheticMobile) metrics.missingMobile += 1;

      if (apply) {
        const dup = await checkBusinessDuplicates(
          prisma,
          row,
          validation.targets.policyTypeId,
          t.mobile,
          refNo,
        );
        if (dup.code === "DUPLICATE_POLICY_NO") {
          metrics.wouldSkip += 1;
          logger.write({
            ...logBase,
            status: "SKIPPED",
            errorType: "SKIPPED_REASON",
            reason: dup.reason ?? "duplicate",
            warnings: [],
          });
          await writeMigrationLog(prisma, migrationRunId, {
            refNo,
            entity: "policy",
            status: "SKIPPED",
            errorType: "SKIPPED_REASON",
            reason: dup.reason,
            warnings: [],
          });
          continue;
        }
        if (dup.code === "OVERLAPPING_DATES") {
          metrics.duplicateWarnings += 1;
          logBase.warnings.push("OVERLAPPING_DATES");
        }
      }

      const resolved = await resolvePolicyDropdownFields(row, resolver);

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
            { migrationRunId, resolver, resolved },
          );
          metrics.wouldSucceed += 1;
          metrics.memberDobSentinelCount += result.memberDobSentinelCount;
          if (result.paymentCreated) metrics.paymentsCreated += 1;
          if (result.chequeCreated) metrics.chequesCreated += 1;
          if (result.receiptCreated) metrics.receiptsCreated += 1;

          const warnings = [
            ...new Set([...result.warnings, ...(t.usedSyntheticMobile ? ["SYNTHETIC_MOBILE"] : [])]),
          ];
          logger.write({
            ...logBase,
            status: "SUCCESS",
            errorType: null,
            reason: null,
            warnings,
          });
          await writeMigrationLog(prisma, migrationRunId, {
            refNo,
            entity: "policy",
            status: "SUCCESS",
            errorType: null,
            reason: null,
            warnings,
          });
          await resolveFailedRow(prisma, migrationRunId, refNo, MigrationPhase.policies);
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
          await writeMigrationLog(prisma, migrationRunId, {
            refNo,
            entity: "policy",
            status: "FAILED",
            errorType: "DB_ERROR",
            reason,
            warnings: [],
            rawJson: verbose ? (row as unknown as Record<string, unknown>) : undefined,
          });
          await enqueueFailedRow(prisma, migrationRunId, refNo, MigrationPhase.policies, "DB_ERROR", reason);
          if (failFast) throw e;
        }
      }

      if (processed % progressEvery === 0) {
        console.error(`Progress: processed ${processed} rows (last ref_no=${lastRefNo})`);
        if (apply && lastRefNo) {
          await saveCheckpoint(prisma, migrationRunId, MigrationPhase.policies, lastRefNo, processed);
        }
      }
    }

    if (stopAll) break;
    if (chunk.length < chunkSize) break;
  }

  if (apply && lastRefNo) {
    await saveCheckpoint(prisma, migrationRunId, MigrationPhase.policies, lastRefNo, processed);
  }

  return { processed, lastRefNo, interrupted: options.interruptRef.value };
}

async function runRetryFailed(
  prisma: PrismaClient,
  pool: ReturnType<typeof createLegacyPool>,
  migrationRunId: string,
  chunkSize: number,
  limit: number | null,
): Promise<void> {
  await assertVersionMatch(prisma, migrationRunId);
  await assertNoConflictingActiveRun(prisma, migrationRunId, true);

  await prisma.migrationRun.update({
    where: { id: migrationRunId },
    data: { isActive: true, status: MigrationRunStatus.running },
  });

  const queue = await prisma.migrationFailedQueue.findMany({
    where: { migrationRunId, resolvedAt: null, phase: MigrationPhase.policies },
    take: limit ?? undefined,
  });

  const lookups = await buildMigrationLookups(prisma);
  const resolver = await DropdownResolver.load(prisma, migrationRunId, false);
  let ok = 0;
  let fail = 0;

  for (const item of queue) {
    const row = await fetchPolicyByRefNo(pool, item.refNo);
    if (!row) {
      fail += 1;
      continue;
    }
    const members = await fetchMembersForRefNos(pool, [item.refNo]);
    const validation = validatePolicyRowWithLookups(row, lookups);
    if (!validation.ok) {
      fail += 1;
      continue;
    }
    try {
      const resolved = await resolvePolicyDropdownFields(row, resolver);
      await applyLegacyPolicyRowWithRetries(
        prisma,
        row,
        members,
        validation.targets,
        defaultDbRetries,
        defaultRetryDelayMs,
        { migrationRunId, resolver, resolved },
      );
      await resolveFailedRow(prisma, migrationRunId, item.refNo, MigrationPhase.policies);
      ok += 1;
    } catch {
      fail += 1;
    }
  }

  await finishMigrationRun(prisma, migrationRunId, MigrationRunStatus.completed);
  console.log(JSON.stringify({ migrationRunId, retried: queue.length, ok, fail }, null, 2));
}

async function main() {
  const reconcileOnly = argFlag("reconcile");
  const retryFailed = argFlag("retry-failed");
  const mastersOnly = argFlag("masters-only");
  const skipMasters = argFlag("skip-masters");
  const unlockStale = argFlag("unlock-stale");
  const forceNewRun = argFlag("force-new-run");
  const failFast = argFlag("fail-fast");

  const dryRun = !argFlag("apply") && !retryFailed && !reconcileOnly;
  const apply = argFlag("apply") || retryFailed;
  const resumeRunId = argValue("resume", undefined)?.trim();
  const explicitRunId = argValue("run-id", undefined)?.trim();

  if (argFlag("dry-run") && argFlag("apply")) {
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
    console.error("Missing legacy DB — set DATABASE_URL_LEGACY or LEGACY_DATABASE");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const pool = createLegacyPool(legacyUrl);
  const legacyDbName = legacyDbNameFromUrl(legacyUrl);

  if (unlockStale) {
    if (!argFlag("confirm")) {
      console.error("Pass --confirm with --unlock-stale");
      process.exit(1);
    }
    const n = await unlockStaleRuns(prisma, Number(argValue("stale-minutes", "30")) || 30);
    console.log(JSON.stringify({ unlockedStaleRuns: n }, null, 2));
    await pool.end();
    await prisma.$disconnect();
    return;
  }

  if (forceNewRun && resumeRunId) {
    console.error("Cannot use --force-new-run with --resume");
    process.exit(1);
  }

  if (forceNewRun && argFlag("confirm")) {
    const active = await prisma.migrationRun.findFirst({
      where: { status: MigrationRunStatus.running, isActive: true },
    });
    if (active) await forceDeactivateRun(prisma, active.id);
  }

  let migrationRunId = resumeRunId ?? explicitRunId ?? null;

  if (retryFailed) {
    if (!migrationRunId) {
      console.error("--retry-failed requires --run-id=");
      process.exit(1);
    }
    try {
      await runRetryFailed(prisma, pool, migrationRunId, chunkSize, limit);
    } finally {
      await pool.end();
      await prisma.$disconnect();
    }
    return;
  }

  if (reconcileOnly) {
    if (!migrationRunId) {
      console.error("--reconcile requires --run-id=");
      process.exit(1);
    }
    await assertVersionMatch(prisma, migrationRunId);
    const report = await runReconciliation(prisma, pool, migrationRunId);
    console.log(JSON.stringify(report, null, 2));
    await pool.end();
    await prisma.$disconnect();
    return;
  }

  await assertNoConflictingActiveRun(prisma, resumeRunId, apply);

  if (resumeRunId) {
    await assertVersionMatch(prisma, resumeRunId);
    migrationRunId = resumeRunId;
    if (apply) {
      await prisma.migrationRun.update({
        where: { id: migrationRunId },
        data: { isActive: true, status: MigrationRunStatus.running, lastHeartbeatAt: new Date() },
      });
    }
  } else if (!migrationRunId) {
    migrationRunId = await createMigrationRun(prisma, apply, legacyDbName, chunkSize);
  }

  const metrics = emptyMetrics();
  metrics.totalPolicyRows = await countPolicyRows(pool);
  metrics.orphanMemberRowsInLegacy = await countOrphanMembers(pool);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(logDir, `migration-${migrationRunId}-${ts}.jsonl`);
  const logger = new JsonlLogger(logPath);

  let releaseLock: (() => Promise<void>) | null = null;
  if (apply && process.env.SKIP_LEGACY_MIGRATION_LOCK !== "1") {
    releaseLock = await acquireMigrationLock(path.join(__dirname, ".migration.lock"));
  }

  const interruptRef = { value: false };
  process.once("SIGINT", () => {
    interruptRef.value = true;
    console.error("\n[legacy-migrate] Interrupt — finishing current row…\n");
  });

  console.log(
    JSON.stringify(
      {
        migrationRunId,
        mode: dryRun ? "DRY_RUN" : "APPLY",
        migrationVersion,
        totalPolicyRows: metrics.totalPolicyRows,
        logFile: logPath,
        chunkSize,
        limit,
        resume: Boolean(resumeRunId),
      },
      null,
      2,
    ),
  );

  try {
    const lookups = await buildMigrationLookups(prisma);
    const resolver = await DropdownResolver.load(prisma, migrationRunId, dryRun);

    if (!skipMasters && !resumeRunId) {
      const masterResult = await migrateMasters(prisma, pool, migrationRunId, dryRun);
      metrics.unmatchedCreated += masterResult.dropdownsCreated;
      console.error(
        `[legacy-migrate] Masters: ${masterResult.distinctValuesProcessed} distinct values, ${masterResult.dropdownsCreated} dropdowns created`,
      );
    }

    if (mastersOnly) {
      await finishMigrationRun(
        prisma,
        migrationRunId,
        dryRun ? MigrationRunStatus.completed : MigrationRunStatus.completed,
      );
      console.log(JSON.stringify({ migrationRunId, mastersOnly: true, metrics }, null, 2));
      return;
    }

    const afterRefNo =
      resumeRunId && !skipMasters
        ? await loadCheckpointRefNo(prisma, migrationRunId, MigrationPhase.policies)
        : resumeRunId
          ? await loadCheckpointRefNo(prisma, migrationRunId, MigrationPhase.policies)
          : null;

    const chunkResult = await processPolicyChunks({
      prisma,
      pool,
      migrationRunId,
      apply,
      dryRun,
      chunkSize,
      limit,
      afterRefNo,
      skipMasters,
      lookups,
      resolver,
      logger,
      metrics,
      verbose,
      failFast,
      interruptRef,
    });

    metrics.unmatchedCreated += resolver.getDropdownsCreatedCount();

    let reconcilePassed = true;
    if (apply && !chunkResult.interrupted) {
      const report = await runReconciliation(prisma, pool, migrationRunId);
      reconcilePassed = report.passed;
      await persistReconciliationAudit(prisma, migrationRunId, report, {
        policies: metrics.wouldSucceed,
        members: metrics.memberDobSentinelCount,
        payments: metrics.paymentsCreated,
        cheques: metrics.chequesCreated,
        receipts: metrics.receiptsCreated,
        skipped: metrics.wouldSkip,
        failed: metrics.wouldFail,
        dropdownsCreated: metrics.unmatchedCreated,
      });
      console.log(JSON.stringify({ reconciliation: report }, null, 2));
    }

    const finalStatus =
      metrics.wouldFail > 0 && failFast
        ? MigrationRunStatus.failed
        : apply && !reconcilePassed
          ? MigrationRunStatus.failed
          : MigrationRunStatus.completed;

    await finishMigrationRun(prisma, migrationRunId, finalStatus);

    console.log(
      JSON.stringify(
        {
          migrationRunId,
          rowsProcessed: chunkResult.processed,
          interrupted: chunkResult.interrupted,
          summary: metrics,
          logFile: logPath,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    if (migrationRunId) {
      await finishMigrationRun(prisma, migrationRunId, MigrationRunStatus.failed);
    }
    throw e;
  } finally {
    if (releaseLock) await releaseLock();
    await logger.end();
    await pool.end();
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
