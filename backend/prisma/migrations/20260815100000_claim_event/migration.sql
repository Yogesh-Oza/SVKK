-- CreateTable
CREATE TABLE `claimevent` (
    `id` VARCHAR(191) NOT NULL,
    `claimId` VARCHAR(191) NOT NULL,
    `eventKey` VARCHAR(64) NOT NULL,
    `sourceRowNumber` INTEGER NULL,
    `kind` ENUM('CANONICAL', 'SAME_EVENT', 'DIFFERENT_EVENT') NOT NULL,
    `outcome` ENUM('IMPORTED', 'UPDATED', 'REJECTED') NOT NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `claimType` VARCHAR(100) NULL,
    `actualLodgeType` VARCHAR(100) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NULL,
    `statusText` VARCHAR(200) NULL,
    `claimAmount` DECIMAL(14, 2) NULL,
    `reportedLodgeAmount` DECIMAL(14, 2) NULL,
    `approvedAmount` DECIMAL(14, 2) NULL,
    `deductionAmount` DECIMAL(14, 2) NULL,
    `discountAmount` DECIMAL(14, 2) NULL,
    `admissionDate` DATETIME(3) NULL,
    `dischargeDate` DATETIME(3) NULL,
    `lodgeDate` DATETIME(3) NULL,
    `claimReceivedDate` DATETIME(3) NULL,
    `paymentDate` DATETIME(3) NULL,
    `paymentDetails` TEXT NULL,
    `paymentInFavourOf` VARCHAR(200) NULL,
    `remark` TEXT NULL,
    `importJobId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `claimevent_eventKey_key`(`eventKey`),
    INDEX `claimevent_claimId_idx`(`claimId`),
    INDEX `claimevent_importJobId_idx`(`importJobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `claimevent` ADD CONSTRAINT `claimevent_claimId_fkey` FOREIGN KEY (`claimId`) REFERENCES `claim`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
