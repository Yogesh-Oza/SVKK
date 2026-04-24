# AI_CONTEXT — SVKK Software

## Purpose

Shree Vagad Kala Kendra (SVKK) **mediclaim policy** platform: premium engine, policies, CSV tools, MIS, claims, receipts, activity logs. Next.js app authenticates to the Express API (JWT access + httpOnly refresh).

## Domain: identity and MIS scope

- **`InsuredParty.svkkPublicId`** is the master public ID; policies and claims tie to it.
- **`UserVillage`**: links a **SUPERVISOR** to village names (matching `Policy.village` / `Claim.village`). **ADMIN** / **SUPER_ADMIN** have full scope.
- **`Policy.createdById`**: **USER** (data entry) can only list/read/update policies they created; supervisors/admins use village-based scoping (no global policy enumeration).
- **CSV upload** (`upload:csv`): **ADMIN** and **SUPER_ADMIN** only.

## Stack

- **Backend**: Node 20+, Express 5, TypeScript, Prisma 6, **MySQL**, JWT, Zod, `pino` logging.
- **Frontend**: Next.js 16, React 19, Tailwind/shadcn. SVKK UI lives under the `frontend/app/(svkk)/` route group (URL paths omit `(svkk)`). **Auth branding**: SVKK Software MEDICLAIM — deep forest green panel (`#064e3b`), soft sky/mint gradient on the form side, white elevated card, black primary CTA; shared `AuthHero` + split grid on `/login` and dashboard `sign-in`.

## Repo layout (SVKK)

```text
backend/
  src/
    modules/          auth, policy, calculation, claim, mis, upload, admin, logs, receipt
    services/         mis-scope, activity-log-scope, activity-log, counter, …
    middlewares/      require-auth, rbac, …
  prisma/schema.prisma
frontend/
  app/
    (svkk)/
      layout.tsx              SvkkAuthProvider
      login/page.tsx          /login
      (main)/
        layout.tsx            auth gate + shell
        dashboard/page.tsx
        calculator/page.tsx
        policies/…
        claims/page.tsx
        mis/page.tsx
        upload/page.tsx
        admin/page.tsx
        logs/page.tsx
  lib/svkk/                   api client, config, nav permissions
  contexts/svkk-auth-context.tsx
```

## API base

- All routes: **`/api/v1/...`**

### Auth

| Method | Path | Notes |
|--------|------|--------|
| POST | `/auth/login` | Returns `{ accessToken, user }`; sets `refreshToken` httpOnly cookie |
| POST | `/auth/refresh` | New access token |
| POST | `/auth/logout` | Clears refresh cookie |

### Core

| Method | Path | Notes |
|--------|------|--------|
| GET | `/policies` | Search + optional `village`; scoped by role |
| GET/POST | `/policies` | Create requires `policy:create` |
| GET/PATCH/DELETE | `/policies/:id` | Scoped read/update/delete |
| GET | `/calculation/reference/policy-types` | Same permission as `calculation:live` (dropdown) |
| GET | `/calculation/reference/charts?policyTypeId=` | Chart list for calculator |
| POST | `/calculation/live` | Premium calculation |
| GET | `/claims` | List + optional filters; village-scoped |
| GET | `/claims/grouped` | Grouped by `svkkPublicId` |
| GET | `/mis/summary` | Aggregates (scoped) |
| GET | `/mis/policies` | Paginated policy rows for MIS |
| POST | `/upload/csv` | `multipart` field `file`; `updateMode`, `dryRun`, `force` |
| GET | `/logs` | **ADMIN** sees USER+SUPERVISOR actors only; **SUPER_ADMIN** all |
| POST | `/receipts/policies/:policyId` | PDF receipt (scoped) |

## RBAC (static map)

| Permission | USER | SUPERVISOR | ADMIN | SUPER_ADMIN |
|------------|------|------------|-------|---------------|
| `calculation:live` | Y | Y | Y | Y |
| `policy:create` / `policy:read` | Y | Y | Y | Y |
| `policy:update` | N | Y | Y | Y |
| `policy:delete` | N | N | Y | Y |
| `claim:*` | N | Y | Y | Y |
| `mis:read` | N | Y | Y | Y |
| `upload:csv` | N | N | Y | Y |
| `logs:read` | N | N | Y | Y |
| `receipt:create` | N | Y | Y | Y |
| `admin:charts` / `admin:policyTypes` | N | N | Y | Y |

`RolePermission` in the database is for documentation; enforcement uses [`backend/src/middlewares/rbac.ts`](../backend/src/middlewares/rbac.ts).

## Environment variables

### Backend (`backend/.env`)

- `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `PORT`, `CORS_ORIGIN`, `CSV_DUPLICATE_MODE`, `UPLOAD_DIR`, `NODE_ENV`

### Frontend

- `NEXT_PUBLIC_API_URL` — e.g. `http://localhost:4000/api/v1`

## Runbook

```bash
cd backend
npx prisma db push
npm run db:seed
npm run dev
```

```bash
cd frontend
# .env: NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
npm run dev
```

- App entry: `http://localhost:3000/` → redirects to `/dashboard` (unauthenticated users go to `/login`).

**Seed users**

| Email | Role | Password |
|-------|------|----------|
| admin@svkk.local | SUPER_ADMIN | admin123! |
| supervisor@svkk.local | SUPERVISOR (DemoVillageA/B) | supervisor123! |
| user@svkk.local | USER | user123! |

## Logging

- Every log line includes **`traceId`** (from `x-request-id` or generated UUID).

## Pending / follow-ups

- S3 for CSV/PDF; optional job queue for large CSVs.
- Optional DB-driven RBAC from `RolePermission` with cache.
- CSV `FULL` mode upsert completeness.

## Risks

- MySQL must be up for Prisma; run `npx prisma db push` after schema changes.
- Prisma `db push` on Windows may show `EPERM` on `prisma generate` if the query engine is locked; retry with IDE closed or restart terminal.
