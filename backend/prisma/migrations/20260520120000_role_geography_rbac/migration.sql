-- Role geography RBAC: RbacRoleVillage / RbacRoleArea + Policy area indexes

CREATE TABLE `RbacRoleVillage` (
    `id` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `dropdownOptionId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `RbacRoleVillage_roleId_dropdownOptionId_key`(`roleId`, `dropdownOptionId`),
    INDEX `RbacRoleVillage_roleId_idx`(`roleId`),
    INDEX `RbacRoleVillage_dropdownOptionId_idx`(`dropdownOptionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RbacRoleArea` (
    `id` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `dropdownOptionId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `RbacRoleArea_roleId_dropdownOptionId_key`(`roleId`, `dropdownOptionId`),
    INDEX `RbacRoleArea_roleId_idx`(`roleId`),
    INDEX `RbacRoleArea_dropdownOptionId_idx`(`dropdownOptionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RbacRoleVillage` ADD CONSTRAINT `RbacRoleVillage_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `RbacRole`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RbacRoleVillage` ADD CONSTRAINT `RbacRoleVillage_dropdownOptionId_fkey` FOREIGN KEY (`dropdownOptionId`) REFERENCES `DropdownOption`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `RbacRoleArea` ADD CONSTRAINT `RbacRoleArea_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `RbacRole`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `RbacRoleArea` ADD CONSTRAINT `RbacRoleArea_dropdownOptionId_fkey` FOREIGN KEY (`dropdownOptionId`) REFERENCES `DropdownOption`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX `Policy_area_deletedAt_idx` ON `Policy`(`area`, `deletedAt`);
CREATE INDEX `Policy_village_area_deletedAt_idx` ON `Policy`(`village`, `area`, `deletedAt`);
