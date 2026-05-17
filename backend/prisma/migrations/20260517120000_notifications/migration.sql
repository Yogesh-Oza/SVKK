-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `policyId` VARCHAR(191) NULL,
    `type` ENUM('POLICY_CREATED', 'POLICY_NUMBER_UPDATED', 'RENEWAL_REMINDER') NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `linkUrl` VARCHAR(500) NULL,
    `emailTo` VARCHAR(255) NULL,
    `emailSent` BOOLEAN NOT NULL DEFAULT false,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
    INDEX `Notification_policyId_idx`(`policyId`),
    INDEX `Notification_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RenewalReminderLog` (
    `id` VARCHAR(191) NOT NULL,
    `policyYearId` VARCHAR(191) NOT NULL,
    `offsetDays` INTEGER NOT NULL,
    `emailTo` VARCHAR(255) NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RenewalReminderLog_policyYearId_offsetDays_key`(`policyYearId`, `offsetDays`),
    INDEX `RenewalReminderLog_sentAt_idx`(`sentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `PolicyYear_policyEnd_deletedAt_idx` ON `PolicyYear`(`policyEnd`, `deletedAt`);

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_policyId_fkey` FOREIGN KEY (`policyId`) REFERENCES `Policy`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RenewalReminderLog` ADD CONSTRAINT `RenewalReminderLog_policyYearId_fkey` FOREIGN KEY (`policyYearId`) REFERENCES `PolicyYear`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
