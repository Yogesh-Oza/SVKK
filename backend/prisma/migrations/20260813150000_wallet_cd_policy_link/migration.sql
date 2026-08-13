-- AlterEnum WalletTxnType
ALTER TABLE `wallettransaction` MODIFY COLUMN `type` ENUM('OPENING', 'TOP_UP', 'DEBIT', 'CREDIT', 'ADJUSTMENT') NOT NULL;

-- AlterEnum WalletTxnSource
ALTER TABLE `wallettransaction` MODIFY COLUMN `source` ENUM('OPENING', 'TOPUP', 'MANUAL', 'CSV', 'POLICY', 'RESTORE') NOT NULL;

-- AlterTable Policy: dateOfSubmission
ALTER TABLE `policy` ADD COLUMN `dateOfSubmission` DATETIME(3) NULL;

-- AlterTable WalletTransaction: policy link + snapshots
ALTER TABLE `wallettransaction`
    ADD COLUMN `policyId` VARCHAR(191) NULL,
    ADD COLUMN `policyNumber` VARCHAR(120) NULL,
    ADD COLUMN `dateOfSubmission` DATETIME(3) NULL,
    ADD COLUMN `monthText` VARCHAR(20) NULL,
    ADD COLUMN `yearText` VARCHAR(8) NULL,
    ADD COLUMN `holderName` VARCHAR(200) NULL,
    ADD COLUMN `village` VARCHAR(200) NULL,
    ADD COLUMN `groupName` VARCHAR(64) NULL,
    ADD COLUMN `policyTypeName` VARCHAR(120) NULL,
    ADD COLUMN `cdAccountUsed` VARCHAR(16) NULL,
    ADD COLUMN `cdAmount` DECIMAL(14, 2) NULL,
    ADD COLUMN `remark` VARCHAR(500) NULL;

CREATE INDEX `wallettransaction_policyId_idx` ON `wallettransaction`(`policyId`);

ALTER TABLE `wallettransaction`
    ADD CONSTRAINT `wallettransaction_policyId_fkey`
    FOREIGN KEY (`policyId`) REFERENCES `policy`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
