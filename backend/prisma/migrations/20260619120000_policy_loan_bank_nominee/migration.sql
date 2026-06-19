-- AlterTable
ALTER TABLE `Policy`
    ADD COLUMN `nomineeDateOfBirth` DATETIME(3) NULL,
    ADD COLUMN `loanRepaymentAmount` DECIMAL(14, 2) NULL,
    ADD COLUMN `loanPendingAmount` DECIMAL(14, 2) NULL,
    ADD COLUMN `policyBankHolderName` VARCHAR(200) NULL,
    ADD COLUMN `policyBankAccountNo` VARCHAR(34) NULL,
    ADD COLUMN `policyBankIfsc` VARCHAR(20) NULL,
    ADD COLUMN `policyBankBranch` VARCHAR(200) NULL,
    ADD COLUMN `policyBankName` VARCHAR(200) NULL;
