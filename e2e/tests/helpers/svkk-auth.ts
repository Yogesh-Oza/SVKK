import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const LOGIN_EMAIL = process.env.LOGIN_EMAIL || "admin@svkk.local";
export const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || "admin123!";
export const BASE_URL = process.env.BASE_URL || "https://svkk.techui.co.in";

/** Fresh Chrome context+page for one test (no shared cookies/storage). */
export async function openFreshChromeSession(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
}> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  return { context, page };
}

/** Log in on SVKK live `/login` and land on dashboard. */
export async function loginAsSvkkAdmin(page: Page) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.locator("#email").fill(LOGIN_EMAIL);
    await page.locator("#password").fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    try {
      await page.waitForURL(/\/dashboard/i, { timeout: 45_000 });
      return;
    } catch (err) {
      if (attempt === 2) {
        const errText = (
          await page.locator("p.text-destructive, .text-destructive").first().textContent().catch(() => null)
        )?.trim();
        throw new Error(
          `SVKK login failed for ${LOGIN_EMAIL}. Still on ${page.url()}.` +
            (errText ? ` UI error: ${errText}` : ` ${(err as Error).message}`),
        );
      }
      await page.waitForTimeout(1_500);
    }
  }
}
