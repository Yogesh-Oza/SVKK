import { Page, expect, Locator } from '@playwright/test';

export const LOGIN_EMAIL = process.env.LOGIN_EMAIL || 'info@prernaacademy.in';
export const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || 'Sunil@123';

export const EXECUTIVE_EMAIL =
  process.env.EXECUTIVE_EMAIL || 'executive@prernaacademy.in';
export const EXECUTIVE_PASSWORD = process.env.EXECUTIVE_PASSWORD || 'Demo@123';

/** Seed ObjectIds used when assigning leads on the live demo DB. */
export const CENTER_HEAD_ID =
  process.env.CENTER_HEAD_ID || '6a782f6be9911fe26d8469fe';
export const TEAM_LEAD_ID =
  process.env.TEAM_LEAD_ID || '6a782f6be9911fe26d8469ff';

/** Log in as Administrator and land on dashboard. */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(LOGIN_EMAIL);
  await page.locator('#password').fill(LOGIN_PASSWORD);
  await page.getByRole('button', { name: /^login$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/i, { timeout: 30_000 });
}

/** Log in as Executive (required for student registration). */
export async function loginAsExecutive(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(EXECUTIVE_EMAIL);
  await page.locator('#password').fill(EXECUTIVE_PASSWORD);
  await page.getByRole('button', { name: /^login$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/i, { timeout: 30_000 });
}

/** Read executive `lId` from sessionStorage after login. */
export async function getExecutiveLId(page: Page): Promise<string> {
  const lId = await page.evaluate(() => {
    const raw = sessionStorage.getItem('user');
    if (!raw) return '';
    try {
      return JSON.parse(raw)?.lId || '';
    } catch {
      return '';
    }
  });
  expect(lId).toBeTruthy();
  return String(lId);
}

/** Open Manage University list. */
export async function goToManageUniversity(page: Page) {
  await page.goto('/dashboard/ManageUniversity');
  await expect(
    page.getByRole('heading', { name: 'Manage University' })
  ).toBeVisible({ timeout: 20_000 });
}

/** Search the university list by name. */
export async function searchUniversity(page: Page, name: string) {
  const search = page.getByLabel('Search ');
  await search.fill('');
  await search.fill(name);
}

export async function pickMuiOption(
  page: Page,
  select: Locator,
  optionLabel: string
) {
  await select.scrollIntoViewIfNeeded();
  await select.click({ force: true });
  const option = page.getByRole('option', { name: optionLabel, exact: true });
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

export async function pickSelectByLabel(
  page: Page,
  label: string | RegExp,
  optionLabel: string
) {
  // Scope to the FormControl that contains this label (avoids duplicate MUI ids)
  const select = page
    .locator('.MuiFormControl-root')
    .filter({ hasText: label })
    .getByRole('combobox')
    .first();
  await pickMuiOption(page, select, optionLabel);
}

/** Pick MUI Select by the underlying `name` attribute (most reliable). */
export async function pickSelectByName(
  page: Page,
  name: string,
  optionLabel: string
) {
  const select = page
    .locator('.MuiFormControl-root')
    .filter({ has: page.locator(`[name="${name}"]`) })
    .getByRole('combobox')
    .first();
  await pickMuiOption(page, select, optionLabel);
}

/** Fill the first semester course row on Add University. */
export async function fillSemesterCourseRow(page: Page) {
  const row = page.locator('table').first().locator('tbody tr').first();

  await row.locator('input[name="department"]').fill('Management');
  await row.locator('input[name="course"]').fill('MBA');
  await row.locator('input[name="specialization"]').fill('Finance');

  const categorySelect = row.getByRole('combobox').nth(1);
  await pickMuiOption(page, categorySelect, 'Regular');

  const semesters = row.locator('input[name="noOfSemesters"]');
  await semesters.scrollIntoViewIfNeeded();
  await semesters.fill('4');

  const eligibility = row.locator('#eligibility');
  await eligibility.scrollIntoViewIfNeeded();
  await eligibility.fill('Graduation');

  const tuition = row.locator('input[name="tuitionFee"]');
  await tuition.scrollIntoViewIfNeeded();
  await tuition.fill('50000');

  const other = row.locator('input[name="otherFee"]');
  await other.scrollIntoViewIfNeeded();
  await other.fill('5000');
  await other.blur();
}
