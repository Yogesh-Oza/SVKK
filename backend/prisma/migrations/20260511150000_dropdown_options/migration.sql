-- Admin-editable dropdown options used by the policy add/edit form
CREATE TABLE `DropdownOption` (
  `id` VARCHAR(191) NOT NULL,
  `type` ENUM(
    'AREA',
    'VILLAGE',
    'CITY',
    'RELATION',
    'GENDER',
    'SUM_INSURED',
    'PAYMENT_MODE',
    'TRANSACTION_STATUS',
    'YES_NO'
  ) NOT NULL,
  `value` VARCHAR(64) NOT NULL,
  `label` VARCHAR(128) NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `isSystem` BOOLEAN NOT NULL DEFAULT FALSE,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `DropdownOption_type_value_key`(`type`, `value`),
  INDEX `DropdownOption_type_sortOrder_idx`(`type`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed system defaults (idempotent via UNIQUE(type,value))
INSERT IGNORE INTO `DropdownOption` (`id`, `type`, `value`, `label`, `sortOrder`, `isActive`, `isSystem`, `updatedAt`) VALUES
  -- GENDER
  (UUID(), 'GENDER', 'M', 'Male',   10, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'GENDER', 'F', 'Female', 20, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'GENDER', 'O', 'Other',  30, 1, 1, CURRENT_TIMESTAMP(3)),

  -- RELATION
  (UUID(), 'RELATION', 'Self',           'Self',           10, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Spouse',         'Spouse',         20, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Son',            'Son',            30, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Daughter',       'Daughter',       40, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Father',         'Father',         50, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Mother',         'Mother',         60, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Brother',        'Brother',        70, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Sister',         'Sister',         80, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Grandfather',    'Grandfather',    90, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Grandmother',    'Grandmother',   100, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Father-in-law',  'Father-in-law', 110, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Mother-in-law',  'Mother-in-law', 120, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'RELATION', 'Other',          'Other',         200, 1, 1, CURRENT_TIMESTAMP(3)),

  -- YES_NO
  (UUID(), 'YES_NO', 'YES', 'YES', 10, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'YES_NO', 'NO',  'NO',  20, 1, 1, CURRENT_TIMESTAMP(3)),

  -- PAYMENT_MODE
  (UUID(), 'PAYMENT_MODE', 'ONLINE', 'Online', 10, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'PAYMENT_MODE', 'CHEQUE', 'Cheque', 20, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'PAYMENT_MODE', 'CASH',   'Cash',   30, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'PAYMENT_MODE', 'NEFT',   'NEFT',   40, 1, 1, CURRENT_TIMESTAMP(3)),

  -- TRANSACTION_STATUS
  (UUID(), 'TRANSACTION_STATUS', 'CLEARED',     'Cleared',     10, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'TRANSACTION_STATUS', 'DISHONOURED', 'Dishonoured', 20, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'TRANSACTION_STATUS', 'PENDING',     'Pending',     30, 1, 1, CURRENT_TIMESTAMP(3)),

  -- SUM_INSURED (rupee amounts)
  (UUID(), 'SUM_INSURED', '100000',  '1,00,000',    10, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'SUM_INSURED', '200000',  '2,00,000',    20, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'SUM_INSURED', '300000',  '3,00,000',    30, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'SUM_INSURED', '500000',  '5,00,000',    40, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'SUM_INSURED', '1000000', '10,00,000',   50, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'SUM_INSURED', '1500000', '15,00,000',   60, 1, 1, CURRENT_TIMESTAMP(3)),
  (UUID(), 'SUM_INSURED', '2000000', '20,00,000',   70, 1, 1, CURRENT_TIMESTAMP(3));
