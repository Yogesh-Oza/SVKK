-- Policy add/update revamp: new policy metadata, premium fields, and payment transaction columns

ALTER TABLE `Policy`
  ADD COLUMN `holderGender` VARCHAR(16) NULL,
  ADD COLUMN `holderJoiningDate` DATETIME(3) NULL,
  ADD COLUMN `holderAddOns` DECIMAL(14,2) NULL,
  ADD COLUMN `previousPolicyNo` VARCHAR(100) NULL,
  ADD COLUMN `previousEndDate` DATETIME(3) NULL,
  ADD COLUMN `policyGroup` VARCHAR(32) NULL,
  ADD COLUMN `courierCompany` VARCHAR(200) NULL,
  ADD COLUMN `podNumber` VARCHAR(100) NULL;

ALTER TABLE `PolicyYear`
  ADD COLUMN `taxPercent` DECIMAL(7,4) NULL,
  ADD COLUMN `taxAmount` DECIMAL(14,2) NULL,
  ADD COLUMN `svkkPremium` DECIMAL(14,2) NULL,
  ADD COLUMN `netPremium` DECIMAL(14,2) NULL,
  ADD COLUMN `vkkCommission` DECIMAL(14,2) NULL,
  ADD COLUMN `policyHolderContribution` DECIMAL(14,2) NULL,
  ADD COLUMN `premiumOneOrTwoLakh` DECIMAL(14,2) NULL,
  ADD COLUMN `gaamMahajanContribution` DECIMAL(14,2) NULL,
  ADD COLUMN `differenceAmountPaidByHolder` DECIMAL(14,2) NULL;

ALTER TABLE `Member`
  ADD COLUMN `addOnsAmount` DECIMAL(14,2) NULL;

ALTER TABLE `Payment`
  ADD COLUMN `transactionNumber` VARCHAR(120) NULL,
  ADD COLUMN `transactionDate` DATETIME(3) NULL,
  ADD COLUMN `bankName` VARCHAR(200) NULL,
  ADD COLUMN `branchName` VARCHAR(200) NULL,
  ADD COLUMN `accountNumber` VARCHAR(64) NULL,
  ADD COLUMN `nameAsPerCheque` VARCHAR(200) NULL,
  ADD COLUMN `ifscCode` VARCHAR(20) NULL,
  ADD COLUMN `notOver` VARCHAR(50) NULL,
  ADD COLUMN `dishonourReason` TEXT NULL,
  ADD COLUMN `returnCharges` DECIMAL(14,2) NULL;

ALTER TABLE `Counter`
  MODIFY COLUMN `type` ENUM('SVKK_PUBLIC_ID', 'SVKK_POLICY_ID', 'POLICY_REFERENCE', 'RECEIPT') NOT NULL;

ALTER TABLE `Policy`
  MODIFY COLUMN `adProductVariant` ENUM('FAMILY_FLOATER','INDIVIDUAL','ASHA_KIRAN','SENIOR_CITIZEN') NULL;
