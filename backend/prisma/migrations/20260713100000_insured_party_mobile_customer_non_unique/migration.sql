-- Multiple policies/holders may share the same mobile or customer ID.
-- Identity for renewals remains svkkPublicId (still unique).

DROP INDEX `InsuredParty_mobile_key` ON `insuredparty`;
CREATE INDEX `InsuredParty_mobile_idx` ON `insuredparty`(`mobile`);

DROP INDEX `InsuredParty_customerId_key` ON `insuredparty`;
-- `InsuredParty_customerId_idx` already exists from schema @@index([customerId])
