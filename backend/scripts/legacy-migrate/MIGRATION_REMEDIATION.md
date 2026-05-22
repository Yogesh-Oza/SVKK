# Legacy migration remediation (wrong InsuredParty links)

## Root cause

`apply-policy-row.ts` resolved `InsuredParty` by **`customerId` first, then `mobile`**, and only warned when `svkkPublicId` differed. Shared legacy `customer_id` or `mobile_first` across different `svvk_id` values caused unrelated policies to attach to one party.

**Example:** Navin / SVKK1021 showed policies 1649, 1650, 1689 in the new DB, while legacy has:

| ref_no | holder | svvk_id   |
|--------|--------|-----------|
| 1649   | Niral  | SVKK1021  |
| 1650   | Vipul  | SVKK1025  |
| 1689   | Navin  | SVKK1021  |

1650 should use a **Vipul / SVKK1025** party, not Navin’s party.

## Fix (code)

`insured-party-resolve.ts` — lookup order:

1. **`svkkPublicId`** (legacy `svvk_id`) — primary identity
2. On create, detect `customerId` / `mobile` collisions with a **different** SVKK and omit or synthesize values instead of reusing the wrong party
3. P2002 handler retries by `svkkPublicId` only (not `OR mobile, svkk`)

## Safe re-migration

Do **not** truncate the whole database. Use run-scoped rollback, then re-apply.

### 1. Preview rollback

```bash
cd backend
npm run legacy-migrate:rollback -- --run-id=<migrationRunId> --dry-run
```

Deletes rows tagged with that `migratedRunId` (policies, years, members, payments, cheques, receipts, orphaned migrated parties).

### 2. Execute rollback

```bash
npm run legacy-migrate:rollback -- --run-id=<migrationRunId> --confirm
```

### 3. Verify spot-check (before re-apply)

```bash
npm run legacy-migrate:compare-parties -- --refs=1649,1650,1689
```

### 4. Re-run migration

```bash
# Dry-run sample
npm run legacy-migrate -- --dry-run --limit=100

# Full apply (new run id auto-assigned, or pin with --run-id=)
npm run legacy-migrate -- --apply
```

Use `--resume=<id>` only with the **same** `CURRENT_VERSION` in `config/migration.ts` after a crash, not after rollback.

### 5. Post-migration checks

```bash
npm run legacy-migrate:compare-parties
npm run legacy-migrate -- --reconcile --run-id=<migrationRunId>
```

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Target Prisma DB (`backend/.env`) |
| `DATABASE_URL_LEGACY` | Legacy MySQL (`svkk_old_db`) |

Default compare script legacy URL: `mysql://root:root@localhost:3306/svkk_old_db` if unset.

## Non-migrated data

Rows created in the app (no `migratedRunId`) are **not** removed by rollback. Only re-migrate policy data that came from the faulty run.

## Production

- Take a DB backup before `--confirm` rollback
- Run compare + dry-run on a staging copy first
- Do not use `--force-new-run` unless you understand active-run locking
