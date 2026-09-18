import { test, expect } from '@playwright/test';

/**
 * Simple login e2e tests against https://prernaacademy.in
 * Style: TestCraft / Playwright record-and-run compatible.
 *
 * Credentials (override via env):
 *   LOGIN_EMAIL / LOGIN_PASSWORD
 *
 * Run:
 *   cd e2e && npm install && npx playwright install chromium
 *   npm run test:login
 */

const LOGIN_EMAIL = process.env.LOGIN_EMAIL || 'info@prernaacademy.in';
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || 'Sunil@123';

test.describe('Prerna Academy – Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('login page shows email, password, and Login button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /log in/i })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /^login$/i })).toBeVisible();
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.locator('#email').fill(LOGIN_EMAIL);
    await page.locator('#password').fill(LOGIN_PASSWORD);
    await page.getByRole('button', { name: /^login$/i }).click();

    await expect(page).toHaveURL(/\/dashboard/i, { timeout: 30_000 });

    // Auth token stored after successful login
    const token = await page.evaluate(() => sessionStorage.getItem('token'));
    expect(token).toBeTruthy();
  });

  test('invalid password shows error message', async ({ page }) => {
    await page.locator('#email').fill(LOGIN_EMAIL);
    await page.locator('#password').fill('WrongPassword@999');
    await page.getByRole('button', { name: /^login$/i }).click();

    // Stay on login; snackbar / message from API
    await expect(page).toHaveURL(/\/login/i);
    await expect(page.getByText(/invalid password|doesn't exist|error/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test('unknown email shows error message', async ({ page }) => {
    await page.locator('#email').fill('nobody@example.com');
    await page.locator('#password').fill('SomePass@123');
    await page.getByRole('button', { name: /^login$/i }).click();

    await expect(page).toHaveURL(/\/login/i);
    await expect(page.getByText(/doesn't exist|invalid|error/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});
