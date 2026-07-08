-- Field-software claim columns (from "Claim data 25-26" Excel). All additive/nullable.
ALTER TABLE `claim`
    ADD COLUMN `mdId` VARCHAR(100) NULL,
    ADD COLUMN `categoryText` VARCHAR(100) NULL,
    ADD COLUMN `actualLodgeType` VARCHAR(100) NULL,
    ADD COLUMN `treatmentType` VARCHAR(100) NULL,
    ADD COLUMN `treatmentProcedure` VARCHAR(300) NULL,
    ADD COLUMN `diseaseCategory` VARCHAR(200) NULL,
    ADD COLUMN `reportedLodgeAmount` DECIMAL(14, 2) NULL,
    ADD COLUMN `discountAmount` DECIMAL(14, 2) NULL,
    ADD COLUMN `remark` TEXT NULL,
    ADD COLUMN `lodgeDate` DATETIME(3) NULL,
    ADD COLUMN `paymentInFavourOf` VARCHAR(200) NULL,
    ADD COLUMN `paymentDate` DATETIME(3) NULL,
    ADD COLUMN `prsCrsDate` DATETIME(3) NULL;
