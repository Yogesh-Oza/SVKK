-- Convert policyGrouping to free-text and add admin-managed option table
ALTER TABLE `Policy`
  MODIFY `policyGrouping` VARCHAR(64) NULL;

CREATE TABLE `PolicyGroupingOption` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(64) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `PolicyGroupingOption_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed from legacy values so dropdown remains populated
INSERT IGNORE INTO `PolicyGroupingOption` (`id`, `name`)
VALUES
  (UUID(), 'SVKK'),
  (UUID(), 'NVKK'),
  (UUID(), 'RTY'),
  (UUID(), 'OTHER');
