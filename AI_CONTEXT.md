# AI_CONTEXT.md — SVKK Insurance Platform

## Project purpose

Standalone Next.js + Express insurance management system for policy registration, premium calculation, claims, and MIS reporting.

## Current task (completed)

**Add Policy — remarks summary below header cards**

On Add AD Policy (non-edit), a **Remarks** card appears below SVKK ID / Customer ID / Policy No / Policy Type / VKK Premium and above Calculated Premium Summary. Shows General Remark, Policy Change Remark, and Category Change Remark from loaded form state.

## Previous task (completed)

**Carry-forward / policy create — allow mobile number change for existing Customer ID**

Carry-forward submits `POST /policies` with the same `customerId` and `svkkPublicId` but users may correct the primary mobile. `createPolicyWithYear` no longer rejects with `Customer ID is linked to a different mobile number`; it reconciles mobile on the matched `InsuredParty` when the new number is unique. `applyInsuredPartyPatch` reuses the same helper. New module: `insured-party-mobile.ts`.

| Layer | Role |
|-------|------|
| `insured-party-mobile.ts` | `reconcileInsuredPartyMobile` — normalize, clash check, update |
| `policy.service.ts` | Create + PATCH paths call reconcile instead of hard conflict |
| `insured-party-mobile.test.ts` | Unit tests for unchanged / update / clash / invalid |

## Previous task (completed)

**Payment transaction/cheque number — allow duplicates across policies**

Removed global uniqueness on `Payment.transactionNumber`. The same cheque or UTR (e.g. `CH-000003`) may appear on multiple policies. Dropped DB unique index `Payment_transactionNumber_key`, added non-unique `Payment_transactionNumber_idx`. Removed app-level batch duplicate check and P2002 conflict handler in `policy.service.ts`. Simplified `prepareYearPaymentReplace` (soft-delete only, no longer clears txn numbers).

| Layer | Role |
|-------|------|
| `schema.prisma` | `@@index([transactionNumber])` replaces `@@unique` |
| `policy-payment.helpers.ts` | Removed `assertUniqueTransactionNumbersInBatch` |
| `policy.service.ts` / `policy-csv-import.ts` | No cross-policy txn uniqueness validation |

**Migration:** `20260615120000_payment_transaction_number_non_unique`

## Previous task (completed)

**Policy CSV update — full fields (ref no match)**

Policies page CSV import supports **Create only** and **Update policy**. Update mode matches policies by `ref no` only and applies every non-empty column from the same Format v2 header set as create (`buildPolicyCsvSample`). Sample CSV uses `GET /policies/export-sample.csv` (same as create). Preview/confirm via `/upload/policy-csv/preview` with `mode=UPDATE_ONLY` + `updateMode=FULL` (default). Legacy `updateMode=POLICY_COURIER` remains API-supported for scoped courier-only updates.

| Layer | Role |
|-------|------|
| `policy-csv-update-scope.ts` | Full vs courier preview helpers + row validation |
| `policy-csv-resolve.ts` | `resolvePolicyForCsvUpdate` (ref-no-only) |
| `policy-csv-import.ts` | `updatePolicyCsvRow` for FULL; `updatePolicyCourierCsvRow` for legacy |
| `policy-upload.routes.ts` | Default `updateMode=FULL` for UPDATE_ONLY |
| `policy-csv-import-panel.tsx` | 2-way mode selector; update uses create-aligned sample |

**Tests:** `policy-csv-update-scope.test.ts`, extended import/preview tests for FULL mode.

## Previous task (completed)

**Category Change Remark — policy forms, list snapshot, CSV import/export**

Third remark field alongside General Remark and Policy Change Remark. Stored in combined `Policy.remarks` with marker `Category Change Remark:`. CSV column: `category change remark`. UI: add/edit form Remarks section, policy list snapshot, detail/profile views.

| Layer | Role |
|-------|------|
| `ad-policy-form-values.ts` / `ad-policy-submit.ts` | Form field + combined remarks on create/patch |
| `ad-policy-detail-to-form.ts` / `policy-csv-utils.ts` | `parseRemarks` / `buildCombinedRemarksFromParts` (3 sections) |
| `policy-csv-flat-headers.ts` | Export/import column `category change remark` |
| `policy-list-snapshot.tsx` | Three remark fields in expanded list row |

## Previous task (completed)

**Policy CSV update — policy + courier (ref no match, superseded by FULL)**

Earlier scoped update: `updateMode=POLICY_COURIER` limited writable columns to policy no, dates, and courier fields. Replaced in UI by full update; API path retained for backward compatibility.

## Previous task (completed)

**Future Premium — API-backed calculations (same as Lookup / Add Policy)**

Policy list (database) on Future Premium no longer builds quotes from paginated `export.json` rows (incomplete member slots → wrong gross/net when `Members: 2`). It now uses `GET /policies?groupBySvkk=false&page=&pageSize=` for the filtered page, then `GET /policies/:id` per row and `policyDetailToLookupResult` (`quoteFromStoredFormValues` for Current Year, chart recalc for future offsets). Member count follows `quote.rows.length`. CSV upload path still uses `buildFutureResults`. Files: `policy-lookup-api.ts` (`fetchFuturePremiumPageFromApi`), `future-premium-panel.tsx`.

## Previous task (completed)

**Future Lookup — API-backed detail (same as Add Policy)**

Lookup no longer uses `export.csv` (one flattened row per policy, easy to pick wrong year/members). It now uses `GET /policies?groupBySvkk=false&sort=periodYearText_desc` to find fiscal-year siblings, picks latest (or suggestion year), then `GET /policies/:id` and `policyDetailToAdFormValues` + `quoteFromStoredFormValues` for stored holder + members + premiums (matches Add Policy fetch). Future year offset still recalculates via charts. Files: `policy-lookup-api.ts`, `future-lookup-panel.tsx`, `policy-lookup-search.ts`, `policy-lookup-suggestions.ts`.

## Previous task (completed)

**Future Lookup — export.csv year/member parsing (superseded by API lookup)**

Earlier export-based fixes: SVKK expansion, `pickBestLookupMatch`, member slot parsing in `future-csv-utils.ts`.

## Previous task (completed)

**Future Lookup — correct policy year when SVKK has multiple years**

Lookup returned the first matching export row (e.g. 2025-26) when Add Policy showed 2026-27 for the same SVKK ID. Earlier fix: `pickBestLookupMatch`, suggestion `yearLabel`, `previousPolicyNo` search. Files: `future-lookup-panel.tsx`, `policy-lookup-search.ts`, `policy.list.ts`.

## Previous task (completed)

**Future Premium — paginated policy list (database source)**

Policy list (database) no longer downloads the full `export.csv` on Generate. New `GET /policies/export.json?page=&pageSize=` returns `{ items, total, page, pageSize, totalPages }` with the same filters as CSV export. Future Premium loads one page at a time (default 25), recalculates premiums per page, and shows pagination controls. Uploaded CSV still paginates client-side over filtered results. MIS cards on DB source reflect **current page only**; export buttons label “(current page)” when more pages exist. Files: `policy.export-csv.ts`, `policy.routes.ts`, `use-future-premium-data.ts`, `future-premium-list-pagination.tsx`, `future-premium-panel.tsx`.

## Previous task (completed)

**Policy payment — Not over field for Online (NEFT)**

Root cause: payment-mode sanitizers intentionally cleared `notOver` for Online/NEFT on save (`PAYMENT_TRANSACTION_CLEAR_BY_MODE.ONLINE` and `PAYMENT_ROW_CLEAR_BY_METHOD[NEFT]`), while the form and detail UI show the field for Online/Cheque. Fix: stop clearing `notOver` for Online/NEFT; show **Not over** on policy detail for non-cheque payments. Files: `ad-policy-payment-mode-fields.ts`, `policy-payment-sanitize.ts`, `policy-bank-display.ts`. Tests: `policy-payment-sanitize.test.ts`, `ad-policy-payments.test.ts`, `policy-bank-display.test.ts`.

## Previous task (completed)

**Future Lookup — suggestions + Generate alignment**

Lookup is DB-only (no Source/CSV upload). Fixed false **“Policy not found”** flash while Generate/suggestion lookup was still loading (`busy` gate on status message). Fixed **“No matching policies”** during in-flight search and stale debounce races (request-id guards). **Suggestions now use the same `export.csv?search=` path as Generate** (`policy-lookup-db.ts`), including digits-first search for `PO-` policy numbers. Files: `future-lookup-panel.tsx`, `policy-lookup-db.ts`, `lookup-suggestions-list.tsx`, `policy-lookup-search.ts`.

## Previous task (completed)

**Future Premium — two sources + policy list filters**

Removed **Uploaded CSV + Policy List** from Future Premium. Sources: **Uploaded CSV** (session storage) and **Policy list (database)** (`GET /policies/export.csv` with filters). Shared multi-select filters (Year, Category, Policy type, Month, Area, Village, Sum insured, Group) match policies page; DB source passes query to export API; CSV source filters `sessionStorage` rows client-side. Files: `future-policy-filters.ts`, `future-premium-policy-filters.tsx`, `future-premium-panel.tsx`, `FUTURE_PREMIUM_SOURCE_OPTIONS`.

## Previous task (completed)

**Claims register — full claim detail edit**

Claim register **Edit** opens a scrollable dialog with all CSV-import fields (policy, patient, amounts, hospital, TPA, dates, illness, payment). `GET /claims/:id` loads detail; `PATCH /claims/:id` accepts full body via `claim-update.schema.ts`. Claim number remains read-only. Requires `claim:update`. Files: `claim-edit-dialog.tsx`, `claim-edit-form.ts`, `claim-detail-types.ts`, `claim-detail.ts`.

## Previous task (completed)

**Future Lookup — autocomplete like Add Policy**

Lookup search field (`/future-premium/lookup`) shows debounced suggestions (≥2 chars) while typing holder name, SVKK ID, policy no., or customer ID. **Policy List Only** / **Uploaded CSV + Policy List** call `GET /policies?search=…&groupBySvkk=false` (same as Add Policy carry-forward). CSV sources also search session-uploaded rows. Keyboard ↑↓ / Enter / Escape; click fills field and runs Generate. Backend policy list search now includes `holderName` (per-year snapshot). Files: `policy-lookup-suggestions.ts`, `policy-lookup-csv-search.ts`, `lookup-suggestions-list.tsx`, `future-lookup-panel.tsx`. Tests: `policy-lookup-suggestions.test.ts` (2), `future-premium-engine.test.ts` (5).

## Previous task (completed)

**Future Premium & Lookup pages (from reference HTML)**

Sidebar group **Future** with **Future Premium** (`/future-premium`) and **Lookup** (`/future-premium/lookup`), gated by `mis:read`. Ported CSV upload, year offset, MIS (overall / policy type / SI), filters, and CSV export from `PUJA GALA MEDICLAIM PREMIUM CHART CALCULATION Future.html`. Uses live premium charts via `fetchPremiumSnapshot` (admin: `/calculator/admin`). CSV accepts Format v2 policy export columns plus compact future-premium sample. Sources: uploaded CSV only, policy export (`GET /policies/export.csv`), or merged. Module: `frontend/features/svkk-future-premium/`.

## Previous task (completed)

**Policy holder details — per-year snapshots (carry forward / update isolation)**

Root cause: all fiscal-year `Policy` rows for one SVKK ID shared one `InsuredParty`; PATCH/create updated `insuredParty.name` (and DOB/PAN/Aadhaar) globally.

Fix: `Policy.holderName`, `holderDateOfBirth`, `holderPan`, `holderAadhaarNo` per policy row; migration backfills from `insuredparty`. Create/carry-forward writes snapshots on new policy without mutating existing party holder fields; PATCH routes `insuredParty.partyName` → policy snapshot. API list/GET/export overlay `insuredParty` with policy snapshot for display. Helpers: `policy-holder-snapshot.ts`. Tests: `policy-holder-snapshot.test.ts`.

## Previous task (completed)

**Add AD policy — Calculated Premium Summary ages on fetch/edit**

On fetch or edit (`autoCalcLocked`), the member table in **Calculated Premium Summary** now shows **stored ages** from the database (`holderAge` / `ageAtEntry` via form `age` fields), matching Holder Details. Ages recalculate from DOB + policy end (`customAge`) only after the user edits age-anchor fields (`dob`, `age`, `policyEnd`, `previousEndDate`, `members[].dob|age`). Helpers: `parseStoredAge`, `resolveQuoteRowAge`, `isAgeAnchorPath`, `useStoredSummaryAges` state in `ad-policy-add-form.tsx`. Tests: `ad-policy-auto-calc.test.ts`.

## Previous task (completed)

**Carry Forward — duplicate Reference No fix**

Root cause: when **Policy Group** was blank on the prior policy, `requestAutoIds` returned early and carry forward only **year-shifted** the old Reference No (e.g. `OTHER2024JUN3001` → `OTHER2025JUN3001`), reusing sequence `3001` even if that 2025 number already existed.

Fix: `ad-policy-id-helpers.ts` resolves grouping from `policyGroup` → `refNo` → `svkkPublicId` → `OTHER`; carry forward always calls `/policies/next-reference-no` for a **fresh** sequence; auto-id refs seeded **before** `setValues` to avoid race with the auto-id `useEffect`.

## Previous task (completed)

**Policy form — member age ≥ 25 alert popup**

On **Add AD policy** (`ad-policy-add-form.tsx`): informational popup **only on Carry Forward / Renew** (not create, save, or update). Triggers when a **male** member was **24** on the prior policy end and turns **25** on the projected next policy year (`projectPolicyEndAfterCarryForward`). Message: `{name} is now 25 so need to take action - new policy or make him policy holder`. **OK** dismisses then carry-forward continues. Helpers: `member-age-25-alert.ts` (`membersTurning25OnCarryForward`, `buildCarryForwardTurning25AlertMessage`). Unit tests: `member-age-25-alert.test.ts`.

## Previous task (completed)

**Policies CSV export — grouped column picker**

Export CSV on Policies page opens `PolicyCsvExportDialog`: grouped multi-select. **Payments** and **Members** show each field once (e.g. Mode of Payment, Name) with subtitle `Payment 1–8` / `Member 1–12`; selecting a field expands to every slot in CSV. Other groups unchanged. `expandsTo` on export. `GET /policies/export-columns`; `GET /policies/export.csv?columns=…`.

| Layer | Role |
|-------|------|
| `policy-csv-export-column-groups.ts` | Group definitions, `pickExportHeaders`, commission sanitize |
| `policy-csv-export-dialog.tsx` | Frontend picker UI |
| `policy.routes.ts` | `/export-columns`, `columns` query on export |

**Tests:** `policy-csv-export-column-groups.test.ts`

## Previous task (completed)

**Sidebar — concept attribution**

Added `concept by rknishar` below **MediClaim Insurance** in `frontend/components/sidebar-logo.tsx` (hidden when sidebar is collapsed).

## Previous task (completed)

**Dashboard — remove commission & reconciliation metric cards**

Removed from Policy dashboard: Commission, Expected premium, Paid (completed), and Gap (expected − paid) cards. Dropped `/mis/dashboard` fetch from `dashboard/page.tsx`; `dashboard-metric-cards.tsx` now shows only Policies, Members + policies, Co/Gross/VKK premium. Commission fields remain on policy forms and full MIS report (permission-gated).

## Previous task (completed)

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
