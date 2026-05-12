-- AlterTable: change policyUrl from VARCHAR(500) to TEXT
ALTER TABLE `Policy` MODIFY COLUMN `policyUrl` TEXT NULL;

-- Migrate existing single-URL values to JSON array format
UPDATE `Policy`
SET `policyUrl` = CONCAT('["', `policyUrl`, '"]')
WHERE `policyUrl` IS NOT NULL
  AND `policyUrl` != ''
  AND `policyUrl` NOT LIKE '[%';
