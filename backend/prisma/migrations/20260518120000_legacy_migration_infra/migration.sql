-- Legacy migration infrastructure + migratedRunId tags

-- AlterTable
ALTER TABLE `InsuredParty` ADD COLUMN `createdInMigrationRunId` VARCHAR(30) NULL,
    ADD COLUMN `migratedRunId` VARCHAR(30) NULL;

-- AlterTable
ALTER TABLE `Policy` ADD COLUMN `migratedRunId` VARCHAR(30) NULL;

-- AlterTable
ALTER TABLE `PolicyYear` ADD COLUMN `migratedRunId` VARCHAR(30) NULL;

-- AlterTable
ALTER TABLE `Member` ADD COLUMN `migratedRunId` VARCHAR(30) NULL;

-- AlterTable
ALTER TABLE `Cheque` ADD COLUMN `migratedRunId` VARCHAR(30) NULL;

-- AlterTable
ALTER TABLE `Payment` ADD COLUMN `migratedRunId` VARCHAR(30) NULL;

-- AlterTable
ALTER TABLE `Receipt` ADD COLUMN `migratedRunId` VARCHAR(30) NULL;

-- CreateIndex
CREATE INDEX `InsuredParty_migratedRunId_idx` ON `InsuredParty`(`migratedRunId`);
CREATE INDEX `InsuredParty_createdInMigrationRunId_idx` ON `InsuredParty`(`createdInMigrationRunId`);
CREATE INDEX `Policy_migratedRunId_idx` ON `Policy`(`migratedRunId`);
CREATE INDEX `PolicyYear_migratedRunId_idx` ON `PolicyYear`(`migratedRunId`);
CREATE INDEX `Member_migratedRunId_idx` ON `Member`(`migratedRunId`);
CREATE INDEX `Cheque_migratedRunId_idx` ON `Cheque`(`migratedRunId`);
CREATE INDEX `Payment_migratedRunId_idx` ON `Payment`(`migratedRunId`);
CREATE INDEX `Receipt_migratedRunId_idx` ON `Receipt`(`migratedRunId`);

-- CreateIndex (idempotent payment key for legacy imports)
CREATE UNIQUE INDEX `Payment_transactionNumber_key` ON `Payment`(`transactionNumber`);

-- CreateTable MigrationRun
CREATE TABLE `MigrationRun` (
    `id` VARCHAR(191) NOT NULL,
    `migrationVersion` VARCHAR(16) NOT NULL,
    `mode` ENUM('dry_run', 'apply') NOT NULL,
    `status` ENUM('running', 'completed', 'failed', 'rolled_back') NOT NULL DEFAULT 'running',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `legacyDbName` VARCHAR(128) NULL,
    `chunkSize` INTEGER NULL,
    `cliArgs` JSON NULL,
    `lastCheckpointRefNo` VARCHAR(255) NULL,
    `lastHeartbeatAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `MigrationRun_status_isActive_idx`(`status`, `isActive`),
    INDEX `MigrationRun_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable MigrationCheckpoint
CREATE TABLE `MigrationCheckpoint` (
    `id` VARCHAR(191) NOT NULL,
    `migrationRunId` VARCHAR(191) NOT NULL,
    `phase` ENUM('masters', 'policies', 'payments', 'receipts') NOT NULL,
    `lastRefNo` VARCHAR(255) NULL,
    `rowsProcessed` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MigrationCheckpoint_migrationRunId_phase_key`(`migrationRunId`, `phase`),
    INDEX `MigrationCheckpoint_migrationRunId_idx`(`migrationRunId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable MigrationLog
CREATE TABLE `MigrationLog` (
    `id` VARCHAR(191) NOT NULL,
    `migrationRunId` VARCHAR(191) NOT NULL,
    `refNo` VARCHAR(255) NOT NULL,
    `entity` VARCHAR(64) NOT NULL,
    `status` ENUM('SUCCESS', 'FAILED', 'SKIPPED') NOT NULL,
    `errorType` VARCHAR(32) NULL,
    `reason` TEXT NULL,
    `warnings` JSON NULL,
    `rawJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MigrationLog_migrationRunId_status_idx`(`migrationRunId`, `status`),
    INDEX `MigrationLog_migrationRunId_refNo_idx`(`migrationRunId`, `refNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable MigrationUnmatchedValue
CREATE TABLE `MigrationUnmatchedValue` (
    `id` VARCHAR(191) NOT NULL,
    `migrationRunId` VARCHAR(191) NOT NULL,
    `dropdownType` ENUM('AREA', 'VILLAGE', 'CITY', 'RELATION', 'GENDER', 'SUM_INSURED', 'PAYMENT_MODE', 'TRANSACTION_STATUS', 'YES_NO') NOT NULL,
    `legacyRaw` VARCHAR(255) NOT NULL,
    `normalizedKey` VARCHAR(128) NOT NULL,
    `resolvedValue` VARCHAR(64) NOT NULL,
    `action` ENUM('exact', 'fuzzy', 'created') NOT NULL,
    `fuzzyScore` DOUBLE NULL,
    `matchedToValue` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MigrationUnmatchedValue_migrationRunId_dropdownType_idx`(`migrationRunId`, `dropdownType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable MigrationFailedQueue
CREATE TABLE `MigrationFailedQueue` (
    `id` VARCHAR(191) NOT NULL,
    `migrationRunId` VARCHAR(191) NOT NULL,
    `refNo` VARCHAR(255) NOT NULL,
    `phase` ENUM('masters', 'policies', 'payments', 'receipts') NOT NULL,
    `errorType` VARCHAR(32) NOT NULL,
    `reason` TEXT NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastAttemptAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MigrationFailedQueue_migrationRunId_refNo_phase_key`(`migrationRunId`, `refNo`, `phase`),
    INDEX `MigrationFailedQueue_migrationRunId_resolvedAt_idx`(`migrationRunId`, `resolvedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable MigrationAudit
CREATE TABLE `MigrationAudit` (
    `id` VARCHAR(191) NOT NULL,
    `migrationRunId` VARCHAR(191) NOT NULL,
    `legacyTotals` JSON NULL,
    `newTotals` JSON NULL,
    `deltas` JSON NULL,
    `policies` INTEGER NOT NULL DEFAULT 0,
    `members` INTEGER NOT NULL DEFAULT 0,
    `payments` INTEGER NOT NULL DEFAULT 0,
    `cheques` INTEGER NOT NULL DEFAULT 0,
    `receipts` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `dropdownsCreated` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MigrationAudit_migrationRunId_key`(`migrationRunId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MigrationCheckpoint` ADD CONSTRAINT `MigrationCheckpoint_migrationRunId_fkey` FOREIGN KEY (`migrationRunId`) REFERENCES `MigrationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MigrationLog` ADD CONSTRAINT `MigrationLog_migrationRunId_fkey` FOREIGN KEY (`migrationRunId`) REFERENCES `MigrationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MigrationUnmatchedValue` ADD CONSTRAINT `MigrationUnmatchedValue_migrationRunId_fkey` FOREIGN KEY (`migrationRunId`) REFERENCES `MigrationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MigrationFailedQueue` ADD CONSTRAINT `MigrationFailedQueue_migrationRunId_fkey` FOREIGN KEY (`migrationRunId`) REFERENCES `MigrationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MigrationAudit` ADD CONSTRAINT `MigrationAudit_migrationRunId_fkey` FOREIGN KEY (`migrationRunId`) REFERENCES `MigrationRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
