-- CreateTable
CREATE TABLE `wallet` (
    `id` VARCHAR(191) NOT NULL,
    `singletonKey` VARCHAR(32) NOT NULL DEFAULT 'default',
    `currentBalance` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `lastUpdatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wallet_singletonKey_key`(`singletonKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallettransaction` (
    `id` VARCHAR(191) NOT NULL,
    `walletId` VARCHAR(191) NOT NULL,
    `txnDate` DATETIME(3) NOT NULL,
    `type` ENUM('OPENING', 'TOP_UP', 'DEBIT') NOT NULL,
    `category` VARCHAR(32) NULL,
    `particulars` VARCHAR(500) NULL,
    `reference` VARCHAR(255) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `balanceAfter` DECIMAL(14, 2) NOT NULL,
    `source` ENUM('OPENING', 'TOPUP', 'MANUAL', 'CSV') NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wallettransaction_walletId_createdAt_idx`(`walletId`, `createdAt`),
    INDEX `wallettransaction_walletId_type_idx`(`walletId`, `type`),
    INDEX `wallettransaction_walletId_category_idx`(`walletId`, `category`),
    INDEX `wallettransaction_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wallettransaction` ADD CONSTRAINT `wallettransaction_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `wallet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallettransaction` ADD CONSTRAINT `wallettransaction_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
