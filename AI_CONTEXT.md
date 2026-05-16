# AI Context — SVKK MediClaim (Next.js standalone)

## Project

Insurance policy / claims / MIS web app with Express API (`backend/`) and Next.js UI (`frontend/`).

## Current task (completed)

Dynamic RBAC: custom roles, permission catalog, admin UI, JWT `roleId` + `permVersion`, audit logging, scope permissions.

## Tech stack

- Node.js, Express, Prisma 6, MySQL
- Next.js (App Router), React, Redux Toolkit, Tailwind

## RBAC architecture

- **Catalog:** `backend/src/domain/permissions/catalog.ts` (source of truth keys)
- **DB:** `Permission`, `RbacRole`, `RolePermission` (effect ALLOW/DENY), `RbacAuditLog`
- **Runtime:** `rbac.service.ts` — effective permissions, cache key `roleId:permVersion`
- **Auth JWT:** `{ sub, roleId, rtv, pv }`
- **`GET /auth/me`:** returns `permissions[]`, `roleId`, `roleName`, `roleSlug`

## API endpoints (RBAC)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/v1/rbac/permissions` | `roles:manage` |
| GET | `/api/v1/rbac/roles` | `roles:manage` |
| GET | `/api/v1/rbac/roles/assignable` | `users:manage` |
| POST | `/api/v1/rbac/roles` | `roles:manage` |
| POST | `/api/v1/rbac/roles/:id/clone` | `roles:manage` |
| PATCH | `/api/v1/rbac/roles/:id` | `roles:manage` |
| DELETE | `/api/v1/rbac/roles/:id` | `roles:manage` (soft) |
| GET | `/api/v1/rbac/users/:id/effective-permissions` | `roles:manage` |

## Environment

- `DATABASE_URL`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `CORS_ORIGIN`
- `PROTECTED_ROLE_SLUGS` (default `super-admin`)

## Migration (existing DB)

1. `npx tsx scripts/migrate-rbac.ts`
2. `npx prisma db push --accept-data-loss`
3. `npx prisma db seed`
4. `npx tsx scripts/backfill-user-role-ids.ts` (if needed)

## System roles (seed slugs)

`super-admin`, `admin`, `supervisor`, `user`

## Frontend

- Permissions: `frontend/lib/svkk/permissions.ts` — `hasPermission(perms, key)`
- Gate: `SvkkPermissionGate` + `route-permissions.ts`
- Admin: `/roles` — role CRUD with searchable permission matrix
- Users: assign `roleId` via `/rbac/roles/assignable`

## Future limitation

Multi-role per user (`UserRole` join table) not implemented; v1 is single `User.roleId`.

## Pending / follow-ups

- Optional: server components middleware for route protection
- Feature flags: `hasPermission && featureFlagEnabled`
- Remove legacy `UserRole` enum from Prisma when fully migrated
