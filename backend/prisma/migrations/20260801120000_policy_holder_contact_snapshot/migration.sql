-- Per-policy contact snapshots so edit/CSV/renewal does not overwrite other years.
--
-- Backfill copies the CURRENT InsuredParty customerId/email/mobile onto each policy.
-- This freezes whatever is currently displayed (including values already mutated by
-- the prior shared-party write bug). It does NOT recover older per-year values that
-- were overwritten before this migration — those may only exist in activity logs,
-- CSV import archives, or DB backups if retained.
--
-- After this migration, policy contact fields are updated only on Policy snapshots.
ALTER TABLE `policy`
  ADD COLUMN `holderCustomerId` VARCHAR(64) NULL,
  ADD COLUMN `holderEmail` VARCHAR(191) NULL,
  ADD COLUMN `holderMobile` VARCHAR(20) NULL;

UPDATE `policy` p
INNER JOIN `insuredparty` ip ON p.`insuredPartyId` = ip.`id`
SET
  p.`holderCustomerId` = ip.`customerId`,
  p.`holderEmail` = ip.`email`,
  p.`holderMobile` = ip.`mobile`
WHERE p.`holderCustomerId` IS NULL
  AND p.`holderEmail` IS NULL
  AND p.`holderMobile` IS NULL;
