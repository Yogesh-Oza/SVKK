-- Per-policy holder snapshots so carry-forward / edit does not overwrite other years.
ALTER TABLE `policy`
  ADD COLUMN `holderName` VARCHAR(200) NULL,
  ADD COLUMN `holderDateOfBirth` DATETIME(3) NULL,
  ADD COLUMN `holderPan` VARCHAR(20) NULL,
  ADD COLUMN `holderAadhaarNo` VARCHAR(12) NULL;

UPDATE `policy` p
INNER JOIN `insuredparty` ip ON p.`insuredPartyId` = ip.`id`
SET
  p.`holderName` = ip.`name`,
  p.`holderDateOfBirth` = ip.`dateOfBirth`,
  p.`holderPan` = ip.`pan`,
  p.`holderAadhaarNo` = ip.`aadhaarNo`
WHERE p.`holderName` IS NULL;
