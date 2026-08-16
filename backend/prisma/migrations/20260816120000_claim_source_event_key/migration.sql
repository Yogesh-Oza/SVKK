-- Allow the same Claim Number on multiple payment rows; identity is sourceEventKey.

DROP INDEX `claim_claimNo_key` ON `claim`;

ALTER TABLE `claim` ADD COLUMN `sourceEventKey` VARCHAR(64) NULL;

CREATE INDEX `claim_claimNo_idx` ON `claim`(`claimNo`);

CREATE UNIQUE INDEX `claim_sourceEventKey_key` ON `claim`(`sourceEventKey`);
