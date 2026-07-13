-- Soft-deleted rows still occupied unique policyNo / referenceNo and blocked re-create.
-- Free those values on already-deleted policies (originals remain in activity log beforeData).

UPDATE `policy`
SET
  `policyNo` = NULL,
  `referenceNo` = NULL
WHERE `deletedAt` IS NOT NULL
  AND (
    (`policyNo` IS NOT NULL AND `policyNo` <> '')
    OR (`referenceNo` IS NOT NULL AND `referenceNo` <> '')
  );
