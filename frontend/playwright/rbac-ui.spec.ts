import { expect, test, type Page } from "@playwright/test";

type Credentials = {
  email: string;
  password: string;
};

const admin: Credentials = {
  email: process.env.PLAYWRIGHT_SVKK_EMAIL ?? "admin@svkk.local",
  password: process.env.PLAYWRIGHT_SVKK_PASSWORD ?? "admin123!",
};

const supervisor =
  process.env.PLAYWRIGHT_SUPERVISOR_EMAIL && process.env.PLAYWRIGHT_SUPERVISOR_PASSWORD
    ? {
        email: process.env.PLAYWRIGHT_SUPERVISOR_EMAIL,
        password: process.env.PLAYWRIGHT_SUPERVISOR_PASSWORD,
      }
    : null;

async function login(page: Page, creds: Credentials) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 20_000 });
}

test.describe("SVKK RBAC route access", () => {
  test("admin can open protected admin pages directly", async ({ page }) => {
    await login(page, admin);

    await page.goto("/roles");
    await expect(page).toHaveURL(/\/roles$/);
    await expect(page.getByRole("heading", { name: "Roles & permissions" })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto("/receipt-settings");
    await expect(page).toHaveURL(/\/receipt-settings$/);
    await expect(page.getByRole("heading", { name: "Receipt Settings" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("supervisor is redirected away from role management URL", async ({ page }) => {
    test.skip(!supervisor, "Set PLAYWRIGHT_SUPERVISOR_EMAIL and PLAYWRIGHT_SUPERVISOR_PASSWORD");
    if (!supervisor) return;
    await login(page, supervisor);

    await page.goto("/roles");
    await page.waitForURL((url) => !url.pathname.endsWith("/roles"), { timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/roles$/);
  });

  test("supervisor can open allowed claims URL", async ({ page }) => {
    test.skip(!supervisor, "Set PLAYWRIGHT_SUPERVISOR_EMAIL and PLAYWRIGHT_SUPERVISOR_PASSWORD");
    if (!supervisor) return;
    await login(page, supervisor);

    await page.goto("/claims");
    await expect(page).toHaveURL(/\/claims$/);
    await expect(page.getByRole("heading", { name: "Claims" })).toBeVisible({ timeout: 20_000 });
  });
});
