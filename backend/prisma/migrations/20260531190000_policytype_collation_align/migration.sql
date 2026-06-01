-- Align policytype collation with policy/claim tables (fixes MySQL 1267 on claim MIS joins).
ALTER TABLE `policytype` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
