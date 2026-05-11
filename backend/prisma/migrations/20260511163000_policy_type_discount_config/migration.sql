-- AlterTable: Premium calculator admin needs a JSON column to persist the
-- discount config (count table / daughter % / holder-member split) per policy
-- type. Nullable so existing rows keep working; the seed fills sane defaults.
ALTER TABLE `PolicyType` ADD COLUMN `discountConfig` JSON NULL;
