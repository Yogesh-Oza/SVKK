-- Complete RBAC migration after partial apply of 20260516070000.

UPDATE `User` SET `roleId` = 'rbac_role_super_admin' WHERE (`roleId` IS NULL OR `roleId` = '') AND `role` = 'SUPER_ADMIN';
UPDATE `User` SET `roleId` = 'rbac_role_admin' WHERE (`roleId` IS NULL OR `roleId` = '') AND `role` = 'ADMIN';
UPDATE `User` SET `roleId` = 'rbac_role_supervisor' WHERE (`roleId` IS NULL OR `roleId` = '') AND `role` = 'SUPERVISOR';
UPDATE `User` SET `roleId` = 'rbac_role_user' WHERE (`roleId` IS NULL OR `roleId` = '') AND (`role` = 'USER' OR `role` IS NULL);

UPDATE `User` SET `roleId` = 'rbac_role_user' WHERE `roleId` IS NULL OR `roleId` = '';

ALTER TABLE `User` DROP FOREIGN KEY `User_roleId_fkey`;

ALTER TABLE `User` MODIFY `roleId` VARCHAR(191) NOT NULL;

ALTER TABLE `User` DROP COLUMN `role`;

ALTER TABLE `User` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `RbacRole`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Policy` MODIFY `policyUrl` TEXT NULL;
