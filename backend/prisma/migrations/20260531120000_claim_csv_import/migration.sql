-- Claim CSV import & extended claim fields

ALTER TABLE `claim` MODIFY `svkkPublicId` VARCHAR(191) NOT NULL DEFAULT '';

ALTER TABLE `claim`
  ADD COLUMN `policyYearId` VARCHAR(191) NULL,
  ADD COLUMN `patientAge` INT NULL,
  ADD COLUMN `patientRelation` VARCHAR(100) NULL,
  ADD COLUMN `patientGender` VARCHAR(16) NULL,
  ADD COLUMN `statusText` VARCHAR(200) NULL,
  ADD COLUMN `claimType` VARCHAR(100) NULL,
  ADD COLUMN `deductionAmount` DECIMAL(14, 2) NULL,
  ADD COLUMN `deductionDetails` TEXT NULL,
  ADD COLUMN `balanceSumInsured` DECIMAL(14, 2) NULL,
  ADD COLUMN `tpaName` VARCHAR(200) NULL,
  ADD COLUMN `insuranceCompany` VARCHAR(200) NULL,
  ADD COLUMN `doBranch` VARCHAR(200) NULL,
  ADD COLUMN `policyHolderName` VARCHAR(200) NULL,
  ADD COLUMN `policyTypeText` VARCHAR(200) NULL,
  ADD COLUMN `policyStartDate` DATETIME(3) NULL,
  ADD COLUMN `policyEndDate` DATETIME(3) NULL,
  ADD COLUMN `sumInsured` DECIMAL(14, 2) NULL,
  ADD COLUMN `claimReceivedDate` DATETIME(3) NULL,
  ADD COLUMN `informationRaisedDate` DATETIME(3) NULL,
  ADD COLUMN `informationReceivedDate` DATETIME(3) NULL,
  ADD COLUMN `hospitalName` VARCHAR(300) NULL,
  ADD COLUMN `hospitalArea` VARCHAR(200) NULL,
  ADD COLUMN `networkType` VARCHAR(50) NULL,
  ADD COLUMN `hospitalInPpn` BOOLEAN NULL,
  ADD COLUMN `admissionDate` DATETIME(3) NULL,
  ADD COLUMN `dischargeDate` DATETIME(3) NULL,
  ADD COLUMN `illness` TEXT NULL,
  ADD COLUMN `deniedReasons` TEXT NULL,
  ADD COLUMN `roomCategory` VARCHAR(100) NULL,
  ADD COLUMN `paymentDetails` TEXT NULL,
  ADD COLUMN `matchStatus` ENUM('MATCHED_EXACT', 'UNLINKED', 'CONFLICT') NULL,
  ADD COLUMN `verificationWarnings` JSON NULL,
  ADD COLUMN `importJobId` VARCHAR(191) NULL;

ALTER TABLE `claim`
  ADD INDEX `claim_policyYearId_idx` (`policyYearId`),
  ADD INDEX `claim_importJobId_idx` (`importJobId`),
  ADD INDEX `claim_matchStatus_idx` (`matchStatus`),
  ADD INDEX `claim_claimReceivedDate_idx` (`claimReceivedDate`);

ALTER TABLE `claim`
  ADD CONSTRAINT `claim_policyYearId_fkey` FOREIGN KEY (`policyYearId`) REFERENCES `policyyear`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `claim_importJobId_fkey` FOREIGN KEY (`importJobId`) REFERENCES `csvimportjob`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `csvimportjob`
  ADD COLUMN `importEntity` ENUM('POLICY', 'CLAIM') NOT NULL DEFAULT 'POLICY',
  ADD COLUMN `linkMode` ENUM('STRICT_MATCH', 'ALLOW_UNLINKED') NULL,
  ADD COLUMN `originalFilePath` VARCHAR(1000) NULL,
  ADD COLUMN `matchStatsJson` TEXT NULL,
  ADD COLUMN `previewTokenHash` VARCHAR(128) NULL,
  ADD COLUMN `progressPercent` INT NULL DEFAULT 0;

ALTER TABLE `csvimportjob`
  ADD INDEX `csvimportjob_importEntity_createdAt_idx` (`importEntity`, `createdAt`);
