import { test, expect } from '@playwright/test';
import {
  loginAsAdmin,
  goToManageUniversity,
  searchUniversity,
  fillSemesterCourseRow,
} from './helpers/auth';

/**
 * University create / edit / update / delete against https://prernaacademy.in
 *
 * Run:
 *   npm run test:university
 *   npm run test:university -- --headed --slow-mo=400
 */

const uniqueName = () =>
  `E2E Uni ${Date.now()}`;

test.describe.serial('Prerna Academy – University CRUD', () => {
  test.setTimeout(120_000);

  let universityName = '';
  let updatedName = '';

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('manage university page loads with Add button', async ({ page }) => {
    await goToManageUniversity(page);
    await expect(page.getByRole('button', { name: 'Add University' })).toBeVisible();
    await expect(page.getByLabel('Search ')).toBeVisible();
  });

  test('create university requires name', async ({ page }) => {
    await page.goto('/dashboard/AddUniversity');
    await expect(page.getByRole('heading', { name: 'ADD UNIVERSITY' })).toBeVisible();

    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('University name is required')).toBeVisible();
  });

  test('create university with semester course details', async ({ page }) => {
    universityName = uniqueName();

    await goToManageUniversity(page);
    await page.getByRole('button', { name: 'Add University' }).click();
    await expect(page).toHaveURL(/\/dashboard\/AddUniversity/i);
    await expect(page.getByRole('heading', { name: 'ADD UNIVERSITY' })).toBeVisible();

    await page.locator('#University-name-input').fill(universityName);
    await fillSemesterCourseRow(page);

    const submit = page.getByRole('button', { name: 'Submit' });
    await submit.scrollIntoViewIfNeeded();
    await submit.click();

    await expect(
      page.getByText(/University added successfully/i)
    ).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/dashboard\/ManageUniversity/i, {
      timeout: 20_000,
    });

    await searchUniversity(page, universityName);
    await expect(page.getByRole('row', { name: new RegExp(universityName) })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('edit and update university name', async ({ page }) => {
    test.skip(!universityName, 'Create test must run first');

    updatedName = `${universityName} Updated`;

    await goToManageUniversity(page);
    await searchUniversity(page, universityName);

    const row = page.getByRole('row', { name: new RegExp(universityName) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'edit' }).click();

    await expect(page).toHaveURL(/\/dashboard\/EditUniversity\//i);
    await expect(page.getByRole('heading', { name: 'UPDATE UNIVERSITY' })).toBeVisible();

    const nameInput = page.locator('#University-name-input');
    await expect(nameInput).toHaveValue(universityName, { timeout: 15_000 });
    await nameInput.fill(updatedName);

    await page.getByRole('button', { name: 'Update' }).click();

    await expect(
      page.getByText(/University Updated successfully/i)
    ).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/dashboard\/ManageUniversity/i, {
      timeout: 20_000,
    });

    await searchUniversity(page, updatedName);
    await expect(page.getByRole('row', { name: new RegExp(updatedName) })).toBeVisible({
      timeout: 15_000,
    });

    universityName = updatedName;
  });

  test('delete university cleans up test data', async ({ page }) => {
    test.skip(!universityName, 'Create/update test must run first');

    await goToManageUniversity(page);
    await searchUniversity(page, universityName);

    const row = page.getByRole('row', { name: new RegExp(universityName) });
    await expect(row).toBeVisible({ timeout: 15_000 });

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toMatch(/delete/i);
      await dialog.accept();
    });

    await row.getByRole('button', { name: 'delete' }).click();

    await expect(
      page.getByText('University data deleted successfully!')
    ).toBeVisible({ timeout: 15_000 });

    await searchUniversity(page, universityName);
    await expect(page.getByRole('row', { name: new RegExp(universityName) })).toHaveCount(0);
  });
});
