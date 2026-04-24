# SVKK Phase 1 architecture

## Topology

- **Next.js** (`frontend/`) — UI; calls REST only for SVKK (`NEXT_PUBLIC_API_URL` → `/api/v1`).
- **Express** (`backend/`) — auth (JWT access + httpOnly refresh), RBAC, domain modules, Prisma, local CSV/receipt files under `UPLOAD_DIR`.

## Backend modules

- `modules/auth` — login, refresh, logout (refresh rotation via `refreshTokenVersion`).
- `modules/policy` — create (transaction: party + policy + year + members), CRUD, search.
- `modules/calculation` — `POST /calculation/live` using versioned charts.
- `modules/admin` — policy types & policy charts (JSON matrix).
- `modules/upload` — CSV with `updateMode`, `dryRun`, `checksum` idempotency.
- `modules/mis` — summary + paginated lists.
- `modules/logs` — activity log read.
- `modules/claim` — claims MVP + grouped view.
- `modules/receipt` — PDF + counter-based receipt number.

## Data rules

- `PolicyYear.policyChartId` is **NOT NULL** — premium always tied to a chart row.
- Counters use **`SELECT … FOR UPDATE`** pattern inside transactions.
- Activity payloads over ~10KB are truncated with overflow markers (S3 hook reserved).

## Environment

See `backend/.env.example` and root `AI_CONTEXT.md`.
