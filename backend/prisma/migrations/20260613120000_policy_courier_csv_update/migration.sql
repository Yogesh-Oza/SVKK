-- Add POLICY_COURIER scoped update mode for v2 policy CSV imports
ALTER TABLE `csvimportjob`
  MODIFY COLUMN `updateMode` ENUM('POD_ONLY', 'POLICY_ONLY', 'FULL', 'POLICY_COURIER') NOT NULL;
