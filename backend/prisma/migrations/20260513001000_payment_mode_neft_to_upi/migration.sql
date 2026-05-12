-- Replace NEFT with UPI in dropdown options
UPDATE `DropdownOption`
SET `value` = 'UPI', `label` = 'UPI'
WHERE `type` = 'PAYMENT_MODE' AND `value` = 'NEFT';

-- If UPI already exists and NEFT didn't get updated (duplicate), just delete NEFT
DELETE FROM `DropdownOption`
WHERE `type` = 'PAYMENT_MODE' AND `value` = 'NEFT';
