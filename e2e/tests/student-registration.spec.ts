import { test, expect, Page, BrowserContext } from '@playwright/test';
import { loginAsExecutive } from './helpers/auth';
import {
  createAssignedLead,
  findAndConnectLead,
  fillPersonalDetails,
  fillAcademicDetails,
  fillCourseDetails,
  uploadDocumentsAndSubmit,
  goToCourseDetailsStep,
  setMuiSelectValue,
  getUniversityDropdownOptions,
  fetchActiveUniversityNames,
} from './helpers/registration';

/**
 * Student registration — one Chrome window reused for all cases.
 *
 * Run:
 *   npm run test:registration
 *   npm run test:registration -- --headed
 */

test.describe.serial('Prerna Academy – Student Registration', () => {
  test.setTimeout(180_000);

  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      baseURL: process.env.BASE_URL || 'https://prernaacademy.in',
      viewport: { width: 1400, height: 900 },
    });
    page = await context.newPage();
    await loginAsExecutive(page);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('new registration page opens for executive', async () => {
    await page.goto('/dashboard/NewRegistration');
    await expect(page.getByText('FIND LEAD BY')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('radio', { name: 'Lead ID' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Phone' })).toBeVisible();
  });

  test('unknown lead shows Lead not found', async () => {
    await page.goto('/dashboard/NewRegistration');
    await expect(page.getByText('FIND LEAD BY')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('radio', { name: 'Lead ID' }).check();
    await page.getByRole('textbox', { name: 'ID' }).fill('LD9999');
    await page.getByRole('button', { name: 'Find' }).click();

    await expect(page.getByText('Lead not found')).toBeVisible({ timeout: 15_000 });
  });

  test('find and connect lead opens personal details', async ({ request }) => {
    const lead = await createAssignedLead(page, request);
    await findAndConnectLead(page, lead.ldUniqueId);

    await expect(page.getByText('Student Details:')).toBeVisible();
    await expect(page.locator('[name="firstName"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
  });

  test('empty personal form stays on Student Details (HTML5 required)', async ({
    request,
  }) => {
    const lead = await createAssignedLead(page, request);
    await findAndConnectLead(page, lead.ldUniqueId);

    await page.getByRole('button', { name: 'Next' }).click();

    // Native required fields block submit — stay on personal step
    await expect(page.getByText('Student Details:')).toBeVisible();
    await expect(page.locator('input[name="sscYear"]')).toHaveCount(0);
  });

  test('university dropdown always shows all active universities', async ({
    request,
  }) => {
    const allUnis = await fetchActiveUniversityNames(request);
    expect(allUnis.length).toBeGreaterThan(0);

    await goToCourseDetailsStep(page, request);

    // Before category: list should already be preloaded with all active unis
    let options = await getUniversityDropdownOptions(page);
    expect(options.sort()).toEqual([...allUnis].sort());

    // After Regular: still all universities (no longer filtered away)
    await setMuiSelectValue(page, 'courseCategory', 'Regular');
    options = await getUniversityDropdownOptions(page);
    expect(options.sort()).toEqual([...allUnis].sort());
    expect(options).toContain('Demo University');
    expect(options).toContain('Mangalayatan University');
    expect(options).toContain('Prerna University');

    // After Online: still all universities
    await setMuiSelectValue(page, 'courseCategory', 'Online');
    options = await getUniversityDropdownOptions(page);
    expect(options.sort()).toEqual([...allUnis].sort());
  });

  test('complete student registration happy path', async ({ request }) => {
    const lead = await createAssignedLead(page, request);

    const stamp = Date.now();
    const studentEmail = `e2e.reg.${stamp}@example.com`;
    const studentPhone = `8${String(stamp).slice(-9)}`;

    await findAndConnectLead(page, lead.ldUniqueId);
    await fillPersonalDetails(page, {
      email: studentEmail,
      phone: studentPhone,
    });
    await fillAcademicDetails(page);
    await fillCourseDetails(page);
    await uploadDocumentsAndSubmit(page);
  });
});
