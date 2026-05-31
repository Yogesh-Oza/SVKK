-- Extend CsvImportJob for enterprise CSV import pipeline
ALTER TABLE `csvimportjob`
  ADD COLUMN `importMode` ENUM('UPSERT', 'UPDATE_ONLY', 'CREATE_ONLY') NOT NULL DEFAULT 'UPSERT' AFTER `updateMode`,
  ADD COLUMN `fileName` VARCHAR(500) NULL AFTER `forceApplied`,
  ADD COLUMN `createdCount` INT NULL AFTER `failCount`,
  ADD COLUMN `updatedCount` INT NULL AFTER `createdCount`,
  ADD COLUMN `durationMs` INT NULL AFTER `updatedCount`,
  ADD COLUMN `csvVersion` VARCHAR(20) NULL AFTER `durationMs`,
  ADD COLUMN `warningsJson` TEXT NULL AFTER `csvVersion`;
