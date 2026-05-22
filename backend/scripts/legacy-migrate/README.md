# Legacy MySQL → Prisma ETL

Imports `policy_table` and `member` from the legacy `techuico_insurance`-style database into the current Prisma schema (`InsuredParty`, `Policy`, `PolicyYear`, `Member`, `Payment`, `Cheque`, `Receipt`).

## Prerequisites

1. **Target DB** — Deploy migrations (includes `MigrationRun` audit tables + `migratedRunId` tags) and seed:

   ```bash
   npx prisma migrate deploy
   npm run db:seed
   npm run db:seed:data-md
   npx prisma generate
   ```

2. **Legacy data** — Import SQL dump into MySQL; ETL reads live tables, not `.sql` files.

3. **Environment** — `DATABASE_URL` (target) and `DATABASE_URL_LEGACY` or `LEGACY_DATABASE=techuico_insurance`.

## Pipeline order

1. **Masters** — DISTINCT legacy values → `DropdownOption` (fuzzy match before auto-create)
2. **Lookup cache** — in-memory maps (policy types, categories, charts)
3. **Policies** — insured parties, policies, years, members (`createMany` per chunk)
4. **Payments / cheques / receipts** — per policy row when `--apply`
5. **Reconciliation** — legacy vs new counts/totals (`MigrationAudit`)

## Commands

```bash
# Dry-run (no policy writes; masters may still preview creates in metrics)
npm run legacy-migrate -- --dry-run
npm run legacy-migrate -- --dry-run --limit=100

# Full apply (batched transactions; default 25 policies per commit)
npm run legacy-migrate -- --apply
npm run legacy-migrate -- --apply --apply-batch-size=50

# Slower but runs overlap-date duplicate queries per row
npm run legacy-migrate -- --apply --strict-duplicates

# Masters only
npm run legacy-migrate -- --apply --masters-only

# Resume after crash (same code version required)
npm run legacy-migrate -- --apply --resume=<migrationRunId>

# Retry failed rows only
npm run legacy-migrate -- --retry-failed --run-id=<migrationRunId>

# Reconciliation report only
npm run legacy-migrate -- --reconcile --run-id=<migrationRunId>

# Rollback (preview / execute)
npm run legacy-migrate:rollback -- --run-id=<id> --dry-run
npm run legacy-migrate:rollback -- --run-id=<id> --confirm

# Stale lock recovery
npm run legacy-migrate -- --unlock-stale --confirm
```

## Flags

| Flag | Purpose |
|------|---------|
| `--apply` / `--dry-run` | Write mode |
| `--resume=<runId>` | Continue from checkpoint |
| `--run-id=<id>` | Pin migration run id |
| `--masters-only` | Phase 1 only |
| `--skip-masters` | Skip master import |
| `--retry-failed --run-id=` | Reprocess `MigrationFailedQueue` |
| `--reconcile --run-id=` | Compare legacy vs migrated totals |
| `--fail-fast` | Stop on first error (default: queue failures) |
| `--chunk-size`, `--limit` | Throughput |
| `--apply-batch-size=25` | Policies per DB transaction during `--apply` (default 25) |
| `--strict-duplicates` | Per-row overlap checks (slower; default skips overlap query) |
| `--unlock-stale --confirm` | Mark stale `running` runs inactive |
| `--force-new-run --confirm` | Emergency: deactivate other active run |

## Reliability

- **Concurrency:** only one active `--apply` run (`MigrationRun.isActive` + file lock)
- **Version lock:** `CURRENT_VERSION` in `config/migration.ts` must match run on resume/retry
- **Checkpoints:** `lastRefNo` saved each chunk → `--resume`
- **Failed queue:** `MigrationFailedQueue` + `--retry-failed`
- **Audit:** `MigrationLog`, `MigrationUnmatchedValue`, `MigrationAudit` keyed by `migrationRunId`
- **Rollback:** `npm run legacy-migrate:rollback` deletes rows tagged with `migratedRunId`

## Configuration

- `config/migration.ts` — version, policy type / category / grouping maps
- `config/dropdown-mappings.ts` — relation, gender, payment mode, cheque status maps

## Verification

1. Dry-run → review summary + `unmatchedCreated`
2. `--apply --limit=1000` → `--reconcile` passes
3. Kill mid-run → `--resume` continues
4. Second `--apply` while first running → rejected
5. Spot-check `ref_no` in UI (dropdown values, payments)
6. **InsuredParty linkage:** `npm run legacy-migrate:compare-parties` (per-ref `svvk_id`, holder, premium)

Wrong-party remediation: see [MIGRATION_REMEDIATION.md](./MIGRATION_REMEDIATION.md).

## PolicyType / charts

Each mapped `PolicyType` needs a **HOLDER** or **COMBINED** `PolicyChart` v1 (admin “Single chart” uploads save as COMBINED).
