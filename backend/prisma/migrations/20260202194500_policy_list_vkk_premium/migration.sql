-- AlterTable
ALTER TABLE `Policy` ADD COLUMN `listVkkPremium` DECIMAL(14, 2) NULL;

-- Backfill from latest policy year by string order of yearLabel (same as app list preview)
UPDATE `Policy` p
LEFT JOIN (
  SELECT py.policyId, py.vkkPremium
  FROM `PolicyYear` py
  INNER JOIN (
    SELECT policyId, MAX(yearLabel) AS maxYL
    FROM `PolicyYear`
    WHERE deletedAt IS NULL
    GROUP BY policyId
  ) t ON t.policyId = py.policyId AND py.yearLabel = t.maxYL AND py.deletedAt IS NULL
) src ON src.policyId = p.id
SET p.listVkkPremium = src.vkkPremium;
