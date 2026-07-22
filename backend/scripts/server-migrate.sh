#!/usr/bin/env bash
# Apply pending Prisma migrations on the deploy target (local or EC2).
# Safe to re-run: migrate deploy only applies migrations not yet recorded.
#
# Usage (from backend app dir, with .env / DATABASE_URL loaded):
#   bash scripts/server-migrate.sh
#   bash /var/www/svkk-backend/scripts/server-migrate.sh
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set. Create $ROOT_DIR/.env or export DATABASE_URL."
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "ERROR: npx/node not found on PATH."
  exit 1
fi

if [ ! -d prisma/migrations ]; then
  echo "ERROR: prisma/migrations missing under $ROOT_DIR"
  exit 1
fi

echo "=== Prisma migrate status (before) ==="
npx prisma migrate status || true

echo "=== Prisma migrate deploy ==="
npx prisma migrate deploy

echo "=== Prisma generate ==="
npx prisma generate

echo "=== Prisma migrate status (after) ==="
npx prisma migrate status

echo "OK: database schema is up to date."
