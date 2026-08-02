-- Seed Wallet / CD permission catalog keys and default role grants.

INSERT INTO `permission` (`id`, `key`, `label`, `group`, `groupOrder`, `description`, `isScope`, `sortOrder`)
VALUES
  ('perm_catalog_wallet_read', 'wallet:read', 'View wallet / CD balance', 'Wallet', 46, NULL, false, 1),
  ('perm_catalog_wallet_opening', 'wallet:opening', 'Set opening wallet balance', 'Wallet', 46, NULL, false, 2),
  ('perm_catalog_wallet_topup', 'wallet:topup', 'Top-up wallet', 'Wallet', 46, NULL, false, 3),
  ('perm_catalog_wallet_debit', 'wallet:debit', 'Manual wallet deduction', 'Wallet', 46, NULL, false, 4),
  ('perm_catalog_wallet_import', 'wallet:import', 'Import wallet usage CSV', 'Wallet', 46, NULL, false, 5),
  ('perm_catalog_wallet_export', 'wallet:export', 'Export wallet data', 'Wallet', 46, NULL, false, 6),
  ('perm_catalog_wallet_clear', 'wallet:clear', 'Clear wallet data', 'Wallet', 46, NULL, false, 7)
ON DUPLICATE KEY UPDATE
  `label` = VALUES(`label`),
  `group` = VALUES(`group`),
  `groupOrder` = VALUES(`groupOrder`),
  `sortOrder` = VALUES(`sortOrder`);

-- ADMIN: all wallet permissions
INSERT INTO `rolepermission` (`id`, `roleId`, `permissionId`, `effect`)
SELECT CONCAT('rp_admin_', REPLACE(p.`key`, ':', '_')), r.id, p.id, 'ALLOW'
FROM `rbacrole` r
INNER JOIN `permission` p ON p.`key` IN (
  'wallet:read', 'wallet:opening', 'wallet:topup', 'wallet:debit',
  'wallet:import', 'wallet:export', 'wallet:clear'
)
WHERE r.slug = 'admin'
ON DUPLICATE KEY UPDATE `effect` = VALUES(`effect`);

-- SUPERVISOR: read, topup, debit, import, export (no opening/clear)
INSERT INTO `rolepermission` (`id`, `roleId`, `permissionId`, `effect`)
SELECT CONCAT('rp_supervisor_', REPLACE(p.`key`, ':', '_')), r.id, p.id, 'ALLOW'
FROM `rbacrole` r
INNER JOIN `permission` p ON p.`key` IN (
  'wallet:read', 'wallet:topup', 'wallet:debit', 'wallet:import', 'wallet:export'
)
WHERE r.slug = 'supervisor'
ON DUPLICATE KEY UPDATE `effect` = VALUES(`effect`);

-- Bump permVersion so sessions refresh effective permissions
UPDATE `rbacrole`
SET `permVersion` = `permVersion` + 1
WHERE `slug` IN ('admin', 'supervisor');
