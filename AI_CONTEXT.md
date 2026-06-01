# AI_CONTEXT.md — SVKK Insurance Platform

## Project purpose

Standalone Next.js + Express insurance management system for policy registration, premium calculation, claims, and MIS reporting.

## Current task (completed)

**Payment-mode field sanitization** — after Carry Forward, changing Mode of Payment (e.g. Cheque → Cash) no longer persists hidden bank/cheque data.

| Layer | Role |
|-------|------|
| Frontend UX | `handlePaymentModeChange` clears incompatible Formik fields when mode changes |
| Frontend submit | `sanitizeByMode` in `mapPaymentTransactionsToApi` + `applyPolicyYearPaymentFieldsToBody` (null at API boundary) |
| Backend | `sanitizePaymentReplaceRow` mandatory in `insertPaymentsForYear` / CSV import; `sanitizeYearPaymentSummary` on policy year create/patch |

**Config (keep in sync):**

- `frontend/features/svkk-policies/ad-policy-payment-mode-fields.ts` — `PAYMENT_TRANSACTION_CLEAR_BY_MODE`
- `backend/src/modules/policy/policy-payment-sanitize.ts` — `PAYMENT_ROW_CLEAR_BY_METHOD`

**Convention:** Form cleared fields use `""`; API/DB use `null`.

**Tests:** `backend/src/modules/policy/policy-payment-sanitize.test.ts` (vitest). Frontend: `frontend/features/svkk-policies/ad-policy-payments.test.ts` (run with project frontend vitest/alias setup).

**Manual verify:** Carry forward cheque policy → switch to Cash → save → detail view and reload show Cash without bank lines; `PolicyYear.bankName` / payment row bank columns null.

## Previous task (completed)

AD policy Add/Edit form: **hydration lock** for premium auto-calculation — load DB values without chart sync until the user edits a calc-trigger field.

## Policy form auto-calculation

| State | When | Behavior |
|-------|------|----------|
| `autoCalcLocked = true` | After fetch-by-SVKK load or edit `resetForm` | Premium/age rollup `useEffect`s skipped; Calculated Premium Summary uses **stored** amounts (`quoteFromStoredFormValues`) |
| `autoCalcLocked = false` | New blank add, carry forward, or user edits calc field | Live `quoteFromInput` + existing sync into Premium Details |
| Carry forward | Renew workflow | Clears premium fields, `autoCalcLocked = false` — immediate chart recalc (unchanged) |

**Key files**

- `frontend/features/svkk-policies/ad-policy-auto-calc.ts` — trigger paths, `shouldUnlockAutoCalc`, stored quote display
- `frontend/features/svkk-policies/ad-policy-add-form.tsx` — `autoCalcLocked`, hydrate ref, unlock on `setFieldValueWithUnlock` / member actions
- `frontend/features/svkk-policies/ad-policy-auto-calc.test.ts` — unit tests (Vitest)

**Calc-trigger fields (unlock):** `adProduct`, `sumInsured`, `person`, DOB/dates, holder gender/relation/add-ons, `members[*]`, add/remove member.

**Not calc-trigger:** customer ID, address, remarks, payment fields, SVKK display IDs.

`fetchedPolicyForUpdate` remains separate (Update vs Create submit, auto-id lock).

## Previous task (completed)

Claim CSV/XLSX import with preview-before-commit, tiered policy matching, match-confidence reporting, and Claim MIS tab (dimensional + trend views).

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind 4, shadcn/ui |
| Backend | Express 5, Prisma 6, MySQL, Zod, Vitest |
| Upload | multer, exceljs (XLSX), CSV parser (policy-csv-parse) |

## Key folders

```
backend/src/modules/claim/     — Claim CRUD + claim-csv-* import pipeline
backend/src/modules/mis/       — Policy MIS + claim-mis.queries.ts
frontend/features/svkk-claims/ — Claim CSV import UI
frontend/features/svkk-mis/    — Policy + Claim MIS sections
frontend/features/svkk-policies/ — AD policy add/edit form + auto-calc lock
```

## Claim import architecture

1. **Preview:** `POST /api/v1/upload/claim-csv/preview` — parses file, returns first 20 rows + summary + signed `previewToken` (15 min TTL).
2. **Confirm:** `POST /api/v1/upload/claim-csv/confirm` — runs batched UPSERT using stored file from preview.
3. **Matching (tiered):**
   - Primary (required): Policy No + Policy Type + Start Date + End Date
   - Secondary (warnings only): Holder Name + Sum Insured
4. **Link modes:** `STRICT_MATCH` (default) | `ALLOW_UNLINKED`
5. **Import mode:** `CREATE_ONLY` only (upsert / update-only planned for a future release)

## API endpoints (claim import & MIS)

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/claims/export-sample.csv` | `claim:import` | Sample import template |
| GET | `/claims/import-stats` | `claim:read` | Aggregated import job stats |
| POST | `/upload/claim-csv/preview` | `claim:import` | Preview first 20 rows |
| POST | `/upload/claim-csv/confirm` | `claim:import` | Commit import after preview |
| GET | `/upload/claim-csv/:jobId` | `claim:import` | Job status + matchStats |
| GET | `/upload/claim-csv/:jobId/errors.csv` | `claim:import` | Error report download |
| GET | `/mis/claim-report` | `mis:read` | Dimensional claim MIS |
| GET | `/mis/claim-trend` | `mis:read` | Month/quarter/year trends |
| GET | `/mis/export/claim-report.csv` | `mis:read` | Export dimensional report |

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | required | MySQL connection |
| `UPLOAD_DIR` | `./uploads` | Stored CSV/XLSX originals under `uploads/claims/` |
| `CSV_IMPORT_BATCH_SIZE` | `500` | Rows per import batch |
| `CLAIM_IMPORT_MAX_ROWS` | `10000` | Max rows per sync import |
| `CSV_DUPLICATE_MODE` | `block` | Block duplicate checksum imports |
| `ACCESS_TOKEN_SECRET` | required | Signs preview tokens (HMAC) |

## Phase 2 — async import queue (not implemented)

For files with 50k+ rows, planned BullMQ worker:

```
Upload → CsvImportJob → Redis queue → Worker → progressPercent on job
```

Requires `REDIS_URL`. Schema reserves `CsvImportJob.progressPercent`.

## Pending / follow-ups

- Super Admin UI to edit `claim.statusMap` in AppSetting
- Claim drill-down sheet (category within village) mirroring policy MIS
- Wire `claim:import` into default admin role seeds on deploy

## Known risks

- Sync import may timeout above ~5k rows on slow hosts — use Phase 2 queue.
- Unlinked claims have empty `svkkPublicId` unless populated from CSV later.
