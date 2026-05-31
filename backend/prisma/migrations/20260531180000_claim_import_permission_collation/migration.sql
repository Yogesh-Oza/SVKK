-- Seed claim:import permission and align claim table collation with policy tables.

INSERT INTO `permission` (`id`, `key`, `label`, `group`, `groupOrder`, `description`, `isScope`, `sortOrder`)
VALUES (
  'perm_catalog_claim_import',
  'claim:import',
  'Import claims (CSV/XLSX)',
  'Claims',
  30,
  NULL,
  false,
  5
)
ON DUPLICATE KEY UPDATE
  `label` = VALUES(`label`),
  `group` = VALUES(`group`),
  `groupOrder` = VALUES(`groupOrder`),
  `sortOrder` = VALUES(`sortOrder`);

INSERT INTO `rolepermission` (`id`, `roleId`, `permissionId`, `effect`)
SELECT
  'rp_admin_claim_import',
  r.id,
  p.id,
  'ALLOW'
FROM `rbacrole` r
INNER JOIN `permission` p ON p.`key` = 'claim:import'
WHERE r.slug = 'admin'
ON DUPLICATE KEY UPDATE `effect` = VALUES(`effect`);

ALTER TABLE `claim` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
