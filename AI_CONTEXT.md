# AI_CONTEXT.md — SVKK Insurance Platform

## Project purpose

Standalone Next.js + Express insurance management system for policy registration, premium calculation, claims, and MIS reporting.

## Current task (completed)

**Policy CSV import — preview before commit (CREATE_ONLY, Format v2)**

Policies page uses `PolicyCsvImportInline`: **Sample CSV** → **Preview import** → dialog (first 20 rows) → **Confirm import** / **Import anyway** on duplicate checksum. Replaces inline Validate/Upload controls.

| Layer | Role |
|-------|------|
| `policy-csv-preview.ts` | `READY` / `EXISTS` / `ERROR` / `CONFLICT`, HMAC token (15 min) |
| `policy-csv-import-job.ts` | Shared import runner for `/upload/csv` and confirm |
| `policy-upload.routes.ts` | `/upload/policy-csv/preview`, `/upload/policy-csv/confirm` |
| `policy-csv-import-panel.tsx` | Frontend panel wired on `policies/page.tsx` |

**Tests:** `policy-csv-preview.test.ts` (111 policy tests passing).

## Previous task (completed)

**Claim MIS — village drill-down popup**

Claim MIS (`groupBy=village`) reuses `PolicyMemberDrillDownSheet` on village name click: category × policy grouping tables (SVKK, NVKK, RTY, OTHER) + Export CSV via existing `/mis/policy-member-report/detail` APIs. Shared filter query builder: `frontend/features/svkk-mis/mis-drill-query.ts`.

## Previous task (completed)

**Claim CSV import — duplicate file UX**

Root cause: confirm errors used Axios generic message (`Request failed with status code 409`) instead of API `message`; duplicate checksum (`DUPLICATE_CSV_IMPORT`) was only enforced on confirm, not shown in preview.

Fixes:
- `frontend/lib/svkk/api-error.ts` — shared `getSvkkErrorMessage` / `getSvkkErrorCode` (users module re-exports)
- `claim-csv-import-panel.tsx` — preview banner + toast, disable Confirm when duplicate, **Import anyway** sends `force: true`
- `claim-upload.routes.ts` — preview returns `duplicateImport` when `CSV_DUPLICATE_MODE=block`

**Tests:** `frontend/lib/svkk/api-error.test.ts`

## Previous task (completed)

**Policy CSV upload/download format alignment**

Verified export → import round-trip on canonical `Payment N {UI label}` headers. Import template (`buildPolicyCsvImportTemplateHeaders`) now includes all payment field types per slot (superset of any export). Sample CSV (`/policies/import-sample.csv`) uses export-aligned UPI Payment 1 columns. Legacy `mode of payment` / `amount` still accepted on import only.

## Previous task (completed)

**Policy CSV export — dynamic payment columns + Payment 1 prefix**

Payment transactions in CSV export now match the UI Payment & Bank Details form:

- Every slot uses `Payment N {UI label}` headers (including Payment 1; legacy unprefixed columns remain import aliases only).
- Columns are **dynamic per slot** based on payment method (UPI → Mobile Number; Cheque → bank fields; Cash → minimal set).
- Export order is **newest first** (Transaction 1 = Payment 1); import reverses to oldest-first for DB.
- Import/create accept `Payment 1 Mode of Payment` with fallback to legacy `mode of payment`.

| Module | Role |
|--------|------|
| `policy-csv-payment-columns.ts` | Field orders, `buildPaymentExportPlan`, export cells, `collectPaymentsFromCsvMap` |
| `policy-csv-export-layout.ts` | Inserts dynamic payment headers between core and premium blocks |
| `policy-csv-flat-headers.ts` | Payment columns removed from flat block (now dynamic) |

**Tests:** `policy-csv-payment-columns.test.ts`, updated slots/export tests (102 policy tests passing).

## Previous task (completed)

Root cause: Yup treated empty optional strings as invalid for `panNo` (`.optional()` + `.matches()` rejects `""`) and could reject blank `paymentMode`. CSV-imported policies often have blank PAN, so edit save failed while Policy Details looked complete.

Fixes:
- `ad-policy-validation-schema.ts` — optional PAN via empty-aware test; blank `paymentMode` coerced to undefined
- `ad-policy-add-form.tsx` — touch all invalid fields on submit, show first concrete error message, map `panNo`/`aadhaarNo` to Policy Holder section, PAN field error display
- `ad-policy-validation-schema.test.ts` — regression tests

## Previous task (completed)

List export (`/policies/export.csv`) now uses `POLICY_CSV_EXPORT_HEADERS` = flat block + Member 2–12 + Payment 2–8 (was flat-only; slot data was built but dropped). Import sample CSV unchanged (flat + Member 1).

## Previous task (completed)

**Policy PATCH — premium fields not persisted**

Root cause: `updatePolicy` built `PolicyYear` update data without `taxPercent`, `taxAmount`, `svkkPremium`, `netPremium`, `vkkCommission`, `gaamMahajanContribution`, etc. (API accepted them; DB never updated). Fixed via `policy-year-financial-fields.ts` shared by create + patch.

**Re-save** affected policies after deploy to backfill values that were lost on prior edits.

## Previous task (completed)

**Policy CSV export — premium fallbacks & Excel-safe phones**

| Fix | Location |
|-----|----------|
| `resolveYearPremiumForExport` (same fallbacks as policy detail UI) | `policy-csv-export-resolve.ts` |
| `formatPhoneForCsvExport` / `csvPhoneCell` (tab + 10-digit local) | `policy-csv-utils.ts` |
| Wired into export + member phones | `policy-csv-format.ts`, `policy-csv-slots.ts` |

**Tests:** `policy-csv-export-resolve.test.ts` (vitest).

## Previous task (completed)

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

## Current task (completed)

AD policy form: **disable live auto-calculation on fetch / edit / update**; keep live calc for **create** and **carry forward** only.

## Policy form auto-calculation

| Mode | When | `autoCalcLocked` | Unlock on user edit? |
|------|------|------------------|----------------------|
| **Stored** | Fetch policy (update flow), edit policy page | `true` after hydrate | **No** — `canEnableLiveAutoCalc` false when `isEdit` or `fetchedPolicyForUpdate` |
| **Live** | New add (blank form), carry forward | `false` after carry forward | **Yes** — calc-trigger fields call `shouldUnlockAutoCalc` with create context |

| State | Behavior |
|-------|----------|
| `autoCalcLocked = true` | Premium/age rollup `useEffect`s skipped; Calculated Premium Summary uses **stored** amounts (`quoteFromStoredFormValues`); summary badge **Stored** |
| `autoCalcLocked = false` | Live `quoteFromInput` + sync into Premium Details; badge **Ready** |

**Key files**

- `frontend/features/svkk-policies/ad-policy-auto-calc.ts` — `canEnableLiveAutoCalc`, `shouldUnlockAutoCalc(path, isHydrating, ctx)`, stored quote display
- `frontend/features/svkk-policies/ad-policy-add-form.tsx` — `autoCalcContext` (`isEdit`, `fetchedForUpdate`), hydrate sets lock, carry forward clears lock
- `frontend/features/svkk-policies/ad-policy-auto-calc.test.ts` — unit tests (Vitest)

**Calc-trigger fields (unlock only in live/create mode):** `adProduct`, `sumInsured`, `person`, DOB/dates, holder gender/relation/add-ons, `members[*]`, add/remove member.

**Live basic premium sync:** In create/carry-forward (`!autoCalcLocked`), holder/member `basicPremium` fields sync from chart when DOB or other calc inputs change—not only when the field was empty. `shouldApplyChartBasicToField` skips overwrite when `premiumManual` is set (user typed in Basic Premium). When a chart row errors (summary shows `—`), `shouldClearBasicOnChartError` clears stale basics so carry-forward amounts do not linger. `resolveQuoteSumInsured` uses policy-level sum insured, or the highest member sum insured when policy SI is blank (common after carry-forward).

**Manual verify**

1. Add policy → change member DOB → summary **Ready** and member Basic Premium input matches table (e.g. 5993 not stale 16889).
2. Fetch policy for update → change DOB → stays **Stored**, form basics unchanged.
3. Edit policy → same as (2).
4. Carry forward → change DOB → **Ready**, basics update from chart.
5. Manually type member Basic Premium → change DOB → manual value preserved.

`fetchedPolicyForUpdate` also gates submit (Update vs Create) and auto-id lock.

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

## Policy import architecture (preview)

1. **Preview:** `POST /api/v1/upload/policy-csv/preview` — multipart `file`, `mode` (default `CREATE_ONLY`); returns first 20 rows + summary + `previewToken` + optional `duplicateImport`.
2. **Confirm:** `POST /api/v1/upload/policy-csv/confirm` — JSON `{ previewToken, force?: boolean }`; runs real import from stored preview file.
3. **Legacy:** `POST /api/v1/upload/csv?dryRun=true|false` — validate/import without dialog (unchanged).

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/policies/import-sample.csv` | `upload:csv` | Sample v2 template |
| POST | `/upload/policy-csv/preview` | `upload:csv` | Preview rows + token |
| POST | `/upload/policy-csv/confirm` | `upload:csv` | Commit after preview |
| POST | `/upload/csv` | `upload:csv` | Direct validate/import (dryRun query) |
| GET | `/upload/csv/:jobId/errors.csv` | `upload:csv` | Error report |

Env: `POLICY_IMPORT_MAX_ROWS` (default 10000), `CSV_DUPLICATE_MODE`, `ACCESS_TOKEN_SECRET` for preview tokens.

## Claim import architecture

1. **Preview:** `POST /api/v1/upload/claim-csv/preview` — parses file, returns first 20 rows + summary + `duplicateImport` (if prior completed job with same checksum) + signed `previewToken` (15 min TTL).
2. **Confirm:** `POST /api/v1/upload/claim-csv/confirm` — body `{ previewToken, force?: boolean }`; `force: true` bypasses duplicate block when `CSV_DUPLICATE_MODE=block`.
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
- Claim-native drill-down (claim counts/amounts by category × grouping) if product wants claim metrics instead of policy member metrics in the popup
- Wire `claim:import` into default admin role seeds on deploy

## Known risks

- Sync import may timeout above ~5k rows on slow hosts — use Phase 2 queue.
- Unlinked claims have empty `svkkPublicId` unless populated from CSV later.
