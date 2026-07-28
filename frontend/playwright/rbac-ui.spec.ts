import { expect, test, type Page } from "@playwright/test";

type Credentials = {
  email: string;
  password: string;
};

const admin: Credentials = {
  email: "admin@svkk.local",
  password: "admin123!",
};

const supervisor: Credentials = {
  email: "supervisor@svkk.local",
  password: "supervisor123!",
};

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
    await expect(page.getByRole("heading", { name: "Roles & permissions" })).toBeVisible();

    await page.goto("/receipt-settings");
    await expect(page).toHaveURL(/\/receipt-settings$/);
    await expect(page.getByRole("heading", { name: "Receipt Settings" })).toBeVisible();
  });

  test("supervisor is redirected away from role management URL", async ({ page }) => {
    await login(page, supervisor);

    await page.goto("/roles");
    await page.waitForURL((url) => !url.pathname.endsWith("/roles"), { timeout: 20_000 });
    await expect(page).not.toHaveURL(/\/roles$/);
  });

  test("supervisor can open allowed claims URL", async ({ page }) => {
    await login(page, supervisor);

    await page.goto("/claims");
    await expect(page).toHaveURL(/\/claims$/);
    await expect(page.getByText("Claims")).toBeVisible();
  });
});
