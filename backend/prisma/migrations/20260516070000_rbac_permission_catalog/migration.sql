-- RBAC revamp: Permission catalog, RbacRole, migrate User.role -> User.roleId,
-- replace legacy RolePermission (module/action) with roleId + permissionId.

-- CreateTable
CREATE TABLE `Permission` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `group` VARCHAR(191) NOT NULL,
    `groupOrder` INTEGER NOT NULL DEFAULT 0,
    `description` VARCHAR(191) NULL,
    `isScope` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `Permission_key_key`(`key`),
    INDEX `Permission_key_idx`(`key`),
    INDEX `Permission_group_groupOrder_idx`(`group`, `groupOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RbacRole` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isDeleted` BOOLEAN NOT NULL DEFAULT false,
    `deletedAt` DATETIME(3) NULL,
    `permVersion` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RbacRole_slug_key`(`slug`),
    INDEX `RbacRole_slug_idx`(`slug`),
    INDEX `RbacRole_isActive_isDeleted_idx`(`isActive`, `isDeleted`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RbacAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `targetRoleId` VARCHAR(191) NULL,
    `targetUserId` VARCHAR(191) NULL,
    `oldSnapshot` JSON NULL,
    `newSnapshot` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RbacAuditLog_actorId_idx`(`actorId`),
    INDEX `RbacAuditLog_targetRoleId_idx`(`targetRoleId`),
    INDEX `RbacAuditLog_targetUserId_idx`(`targetUserId`),
    INDEX `RbacAuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AppSetting (idempotent if an earlier migration was not applied on this DB)
CREATE TABLE IF NOT EXISTS `AppSetting` (
    `key` VARCHAR(100) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed system roles (stable ids for backfill; seed.ts upserts by slug)
INSERT INTO `RbacRole` (`id`, `name`, `slug`, `description`, `isSystem`, `isActive`, `isDeleted`, `permVersion`, `createdAt`, `updatedAt`)
VALUES
    ('rbac_role_super_admin', 'Super Admin', 'super-admin', 'System role (SUPER_ADMIN)', true, true, false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('rbac_role_admin', 'Admin', 'admin', 'System role (ADMIN)', true, true, false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('rbac_role_supervisor', 'Supervisor', 'supervisor', 'System role (SUPERVISOR)', true, true, false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('rbac_role_user', 'User', 'user', 'System role (USER)', true, true, false, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `description` = VALUES(`description`),
    `isSystem` = VALUES(`isSystem`),
    `isActive` = VALUES(`isActive`),
    `isDeleted` = VALUES(`isDeleted`),
    `updatedAt` = CURRENT_TIMESTAMP(3);

-- Replace legacy RolePermission (role/module/action) with catalog-based rows
DROP TABLE IF EXISTS `RolePermission`;

CREATE TABLE `RolePermission` (
    `id` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,
    `effect` ENUM('ALLOW', 'DENY') NOT NULL DEFAULT 'ALLOW',

    INDEX `RolePermission_roleId_idx`(`roleId`),
    INDEX `RolePermission_permissionId_idx`(`permissionId`),
    UNIQUE INDEX `RolePermission_roleId_permissionId_key`(`roleId`, `permissionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- User.role -> roleId backfill continues in 20260516070001_rbac_user_backfill
-- (handles DBs where roleId was added before the first migration failed mid-flight).
