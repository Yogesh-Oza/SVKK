-- Same cheque/UTR may appear on multiple policies; drop global uniqueness.
DROP INDEX `Payment_transactionNumber_key` ON `payment`;

CREATE INDEX `Payment_transactionNumber_idx` ON `payment`(`transactionNumber`);
