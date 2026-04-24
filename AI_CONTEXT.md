# AI_CONTEXT — SVKK Software

## Purpose

Shree Vagad Kala Kendra (SVKK) **mediclaim policy** platform: premium engine, policies, CSV tools, MIS, claims MVP, receipts.

## Stack

- **Backend**: Node 20+, Express 5, TypeScript, Prisma 6, **MySQL**, JWT (access + httpOnly refresh), `pino` logging, Zod validation.
- **Frontend**: Next.js 16, React 19, Tailwind/shadcn UI kit + SVKK screens at **`/login`**, **`/dashboard`**, **`/policies`** (source lives in `app/(svkk)/…`; the `(svkk)` segment is not part of the URL).

## Repo layout

- `backend/` — API (`npm run dev`), Prisma schema, seed.
- `frontend/` — UI only (no Next.js API routes); calls **`backend`** at `NEXT_PUBLIC_API_URL`. `npm run dev` or `pnpm dev`.
- `docs/` — architecture, identity, API errors, premium rules, sample CSVs.

## API base

- All routes: **`/api/v1/...`**
- Example: `POST /api/v1/auth/login`, `POST /api/v1/policies`, `POST /api/v1/calculation/live`

## Environment variables

### Backend (`backend/.env`)

- `DATABASE_URL` — MySQL connection string
- `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` — min 32 chars
- `PORT` — default `4000`
- `CORS_ORIGIN` — e.g. `http://localhost:3000`
- `CSV_DUPLICATE_MODE` — `block` | `warn`
- `UPLOAD_DIR` — CSV + PDF storage (local Phase 1)

### Frontend

- `NEXT_PUBLIC_API_URL` — e.g. `http://localhost:4000/api/v1`

## Runbook

```bash
cd backend
cp .env.example .env
# edit DATABASE_URL and secrets
npx prisma db push
npm run db:seed
npm run dev
```

```bash
cd frontend
# set NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
npm run dev
```

- UI: `http://localhost:3000/login` (seed: `admin@svkk.local` / `admin123!`)

## Logging

- Levels: `info`, `warn`, `error`
- Every log line includes **`traceId`** (from `x-request-id` or generated UUID).

## Pending / follow-ups

- Wire S3 for CSV/PDF instead of `UPLOAD_DIR`.
- **No queue layer (no BullMQ/Redis)** in Phase 1: CSV and receipts run **synchronously** in the API process; scale-up would add a worker/queue later if needed.
- Expand RBAC from static map to DB-driven checks per `RolePermission`.

## Risks

- MySQL must be available for Prisma; use `prisma db push` for dev schema sync.
- CSV `FULL` mode currently requires existing policy (stub); extend for full upsert.
