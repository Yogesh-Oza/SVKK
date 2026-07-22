-- Durable archive snapshot for Policy No / Reference No (restore from Recycle Bin)
ALTER TABLE `policy`
  ADD COLUMN `archivedPolicyNo` VARCHAR(191) NULL,
  ADD COLUMN `archivedReferenceNo` VARCHAR(255) NULL;

CREATE INDEX `policy_deletedAt_idx` ON `policy`(`deletedAt`);
