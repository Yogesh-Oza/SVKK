# SVKK Backend

Express + Prisma + MySQL API for SVKK Phase 1.

## Setup

```bash
cp .env.example .env
# Set DATABASE_URL, ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET (32+ chars each)

npm install
npx prisma db push
npm run db:seed
npm run dev
```

Server: `http://localhost:4000` — routes under `/api/v1`.

## Scripts

- `npm run dev` — `tsx watch src/server.ts`
- `npm run db:transfer-local -- --source "mysql://root:root@localhost:3306/railway" --target "mysql://vagadevents_root:password@86.107.77.144:3306/vagadevents_svkkdb" --truncate` — copy rows from source to target MySQL
- `npm test` — Vitest (phone + premium golden tests)
- `npm run db:seed` — admin user + Asha Kiran sample charts

## Health

`GET /health` — no version prefix.
