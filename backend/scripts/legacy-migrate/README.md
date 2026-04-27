# Legacy MySQL → Prisma ETL

Imports `policy_table` and `member` from the legacy `techuico_insurance`-style database into the current Prisma schema (`InsuredParty`, `Policy`, `PolicyYear`, `Member`).

## Prerequisites

1. **Target DB** — Run migrations (including `Policy.referenceNo` unique index) and seed:

   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```

2. **Uniqueness** — Before the unique index, confirm legacy data has one row per `ref_no`:

   ```sql
   SELECT COUNT(*) AS c, COUNT(DISTINCT ref_no) AS d FROM policy_table;
   ```

   On the target DB, ensure no conflicting `Policy.referenceNo` values if re-running.

3. **Legacy data source (`techuico_insurance.sql` etc.)**

   The CLI does **not** read `.sql` files. Import the dump into MySQL first, then point the ETL at that database:

   ```bash
   mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS techuico_insurance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   mysql -u root -p techuico_insurance < path/to/techuico_insurance.sql
   ```

4. **Environment**

   - `DATABASE_URL` — Prisma (target) MySQL, e.g. database `svkk`.
   - **Either** `DATABASE_URL_LEGACY` — full connection string to the legacy database,  
   **or** `LEGACY_DATABASE` / `LEGACY_DATABASE_NAME` — only the database name (same host, user, password, port as `DATABASE_URL`). Example: `LEGACY_DATABASE=techuico_insurance`.

   See `.env.example`.

## Commands

Dry-run (default-safe; no writes):

```bash
npm run legacy-migrate -- --dry-run
npm run legacy-migrate -- --dry-run --limit=100 --chunk-size=200
```

After the first JSON block (totals / log path), the tool still walks every policy row. Wait for the **final JSON** with `rowsProcessed` and `summary` (`wouldSucceed`, `wouldSkip`, …). If you stop early (Ctrl+C), you get a partial `rowsProcessed` and `"interrupted": true`.

Apply (writes; uses lock file `scripts/legacy-migrate/.migration.lock` unless `SKIP_LEGACY_MIGRATION_LOCK=1`):

```bash
npm run legacy-migrate -- --apply
```

Flags:

- `--dry-run` — Validate and log only.
- `--apply` — Run per-row transactions against Prisma.
- `--legacy-db=name` — Legacy database name (overrides `LEGACY_DATABASE`); builds URL from `DATABASE_URL`.
- `--chunk-size=N` — Keyset page size (default from `config/migration.ts`).
- `--limit=N` — Stop after N policy rows (smoke tests).
- `--log-dir=path` — JSONL log directory (default `scripts/legacy-migrate/logs`).
- `--verbose` — Attach `rawData` to failed log lines.

## Behaviour summary

- **Keyset pagination** on `policy_table.ref_no`.
- **One `prisma.$transaction` per policy row** (all members for that row in the same tx).
- **Idempotency:** `Policy.upsert` by `referenceNo`; `PolicyYear.upsert` by `(policyId, yearLabel)`; members replaced with `deleteMany` + `createMany`.
- **Retries:** Up to 3 attempts on transient DB errors (deadlock / timeout).
- **Logs:** One JSON line per row: `status`, `errorType`, `reason`, `warnings`, `migrationVersion`, `ts`.

## Configuration

Edit `config/migration.ts` for:

- `POLICY_TYPE_MAP` (legacy `policy_type` text → Prisma `PolicyType.key`)
- Category letter map, policy grouping map, sentinel DOB, chunk defaults, date handling notes

## Verification checklist

1. Dry-run on a copy of production legacy data; review JSONL and console summary (`wouldSucceed`, `wouldSkip`, `missingChart`, `unknownPolicyType`, `orphanMemberRowsInLegacy`).
2. Run `--apply` on staging; spot-check a few `ref_no` values (holder, year premiums, member list).
3. Run `--apply` twice on the same data; counts should stay stable (no duplicate policies/members).

## PolicyType / chart requirements

Each mapped `PolicyType` must have a **HOLDER** `PolicyChart` at **version 1** (as created by `prisma/seed.ts` for `ad_policy` and `asha_kiran`). If you add types, add charts before migrating.
