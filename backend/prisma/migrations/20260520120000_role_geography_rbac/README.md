# Role geography RBAC migration

## Forward

1. Apply this migration (`prisma migrate deploy`).
2. Run seed or `backend/scripts/migrate-role-geo-from-user-village.ts` to map supervisor `UserVillage` rows to `RbacRoleVillage` via `DropdownOption` (type `VILLAGE`).

## Rollback

1. Revert application code to read `UserVillage` in `loadMisScope` (git revert).
2. Optionally copy `RbacRoleVillage` back to `UserVillage` per user sharing that role.
3. Drop tables (only after verify):

```sql
DROP TABLE IF EXISTS `RbacRoleArea`;
DROP TABLE IF EXISTS `RbacRoleVillage`;
DROP INDEX `Policy_area_deletedAt_idx` ON `Policy`;
DROP INDEX `Policy_village_area_deletedAt_idx` ON `Policy`;
```
