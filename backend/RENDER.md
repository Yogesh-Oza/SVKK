# Deploy SVKK backend on Render

The API needs **Prisma tables** (`Permission`, `AppSetting`, `Policy`, …) in the database pointed to by `DATABASE_URL`.  
If you only created an empty MySQL instance, `npm start` will fail until you run setup **once from Render** (no need to open the DB from your home IP).

## 1. Environment variables (Render → Web Service → Environment)

| Variable | Example | Notes |
|----------|---------|--------|
| `DATABASE_URL` | `mysql://user:pass@host:3306/vagadevents_svkkdb` | **App DB** — must NOT be the legacy import database |
| `NODE_ENV` | `production` | |
| `ACCESS_TOKEN_SECRET` | 32+ random chars | |
| `REFRESH_TOKEN_SECRET` | 32+ random chars | |
| `CORS_ORIGIN` | `https://your-frontend.onrender.com` | |

Optional (legacy import only, not for normal API):

- `DATABASE_URL_LEGACY` — old `policy_table` database; used only when running `npm run legacy-migrate` manually.

## 2. Service settings

**Root Directory:** `backend`

**Build Command:**

```bash
npm install && npx prisma generate && npm run build
```

**Release Command** (runs on every deploy, from Render’s network — can reach private DB):

```bash
npm run db:setup
```

This runs:

1. `prisma db push` — creates all tables  
2. `prisma db seed` — permissions, roles, admin user, charts  
3. `seed-data-md` — area/village dropdowns  

**Start Command:**

```bash
npm start
```

## 3. One-time manual setup (if Release Command was empty)

Render Dashboard → your **Web Service** → **Shell** (or **Manual Deploy** with release command):

```bash
cd backend   # if shell opens at repo root
npm run db:setup
```

Then redeploy or restart the service.

## 4. Import legacy policies (optional)

Only after `db:setup` succeeds. In Shell (with `DATABASE_URL` = app DB and `DATABASE_URL_LEGACY` = old DB):

```bash
npm run legacy-migrate -- --apply
```

## 5. Default login (after seed)

| Email | Password |
|-------|----------|
| `admin@svkk.local` | `admin123!` |

Change passwords after first login in production.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Table Permission does not exist` | Run **Release Command** `npm run db:setup` or Shell `npm run db:setup` |
| `Table policy does not exist` | Same — wrong/empty database on `DATABASE_URL` |
| Permission catalog failed in production | Re-run `npm run db:seed` after deploy |
| `tsx: not found` on release | Use Build Command `npm install` (not `npm ci --omit=dev`) or add release: `npx prisma db push && npx prisma db seed` |
