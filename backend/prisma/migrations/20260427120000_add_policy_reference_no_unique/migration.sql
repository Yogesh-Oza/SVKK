-- AlterTable: widen referenceNo for legacy ref_no values; add unique index for ETL idempotency
ALTER TABLE `Policy` MODIFY `referenceNo` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `Policy_referenceNo_key` ON `Policy`(`referenceNo`);
