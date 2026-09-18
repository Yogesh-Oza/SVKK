import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  E2E_SVKK_ID,
  mockAge25CarryForwardApis,
} from "./helpers/age25-fixtures";
import {
  loginAsSvkkAdmin,
  openFreshChromeSession,
} from "./helpers/svkk-auth";

/**
 * Live SVKK — Member age 25 popup on Carry Forward / Renew.
 *
 * Uses `e2e/.env` (BASE_URL, LOGIN_EMAIL, LOGIN_PASSWORD).
 * Each test opens a **new Chrome session** (fresh context), headed by default.
 *
 * Run:
 *   cd e2e
 *   npm run test:age25
 */

test.describe("SVKK live – 25yrs carry-forward popup", () => {
  test.setTimeout(180_000);

  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    ({ context, page } = await openFreshChromeSession(browser));
  });

  test.afterEach(async () => {
    await context?.close();
  });

  async function gotoAddPolicy() {
    await page.goto("/policies/new", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /add ad policy/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/fetch old policy by svkk id/i)).toBeVisible();
  }

  /** Login, install mocks, then open renew URL so Carry Forward runs automatically. */
  async function startRenewWithMember(member: {
    name: string;
    relationship: string;
    dob: string;
    gender: string;
    ageAtEntry: number | null;
  }) {
    await loginAsSvkkAdmin(page);
    await mockAge25CarryForwardApis(page, member);
    await page.goto(`/policies/new?svkk=${E2E_SVKK_ID}&renew=1`, {
      waitUntil: "domcontentloaded",
    });
    // Dialog can aria-hide the page heading — wait for either surface.
    await expect(
      page
        .getByRole("heading", { name: /add ad policy|member age notice/i })
        .first(),
    ).toBeVisible({ timeout: 45_000 });
  }

  async function dismissBasePremiumHelperIfOpen() {
    const dismiss = page.getByRole("button", { name: /^dismiss$/i });
    try {
      if (await dismiss.isVisible({ timeout: 3_000 })) {
        await dismiss.click({ force: true, timeout: 5_000 });
        await page.waitForTimeout(500);
      }
    } catch {
      await page.keyboard.press("Escape").catch(() => undefined);
    }
  }

  test("login + add policy page shows Carry Forward control", async () => {
    await loginAsSvkkAdmin(page);
    await gotoAddPolicy();
    await expect(page.getByRole("button", { name: /carry forward \/ renew/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /carry forward \/ renew/i })).toBeDisabled();
  });

  test("male age 24 → Carry Forward shows Member age notice (now 25)", async () => {
    await startRenewWithMember({
      name: "Ravi Kumar",
      relationship: "son",
      dob: "2001-06-15",
      gender: "M",
      ageAtEntry: 24,
    });

    const dialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: /member age notice/i }),
    });
    await expect(dialog).toBeVisible({ timeout: 45_000 });
    await expect(dialog.getByText(/ravi kumar is now 25 so need to take action/i)).toBeVisible();
    await dialog.getByRole("button", { name: /^ok$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  });

  test("after OK on 25yrs popup, dialog closes and form stays on add policy", async () => {
    await startRenewWithMember({
      name: "Ravi Kumar",
      relationship: "son",
      dob: "2001-06-15",
      gender: "M",
      ageAtEntry: 24,
    });

    const ageDialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: /member age notice/i }),
    });
    await expect(ageDialog).toBeVisible({ timeout: 45_000 });
    await ageDialog.getByRole("button", { name: /^ok$/i }).click();
    await expect(ageDialog).toBeHidden({ timeout: 15_000 });
    await dismissBasePremiumHelperIfOpen();
    await expect(page).toHaveURL(/\/policies\/new/i);
  });

  test("female turning 24→25 does NOT show 25yrs popup", async () => {
    await startRenewWithMember({
      name: "Anita",
      relationship: "daughter",
      dob: "2001-06-15",
      gender: "F",
      ageAtEntry: 24,
    });

    // Give renew a moment; age dialog must never appear.
    await page.waitForTimeout(2_000);
    await expect(
      page.getByRole("dialog").filter({
        has: page.getByRole("heading", { name: /member age notice/i }),
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/carried forward|copied|1 year-wise policy found/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await dismissBasePremiumHelperIfOpen();
  });

  test("male still under 24 on new year does NOT show 25yrs popup", async () => {
    await startRenewWithMember({
      name: "Arnav",
      relationship: "son",
      dob: "2001-08-15",
      gender: "M",
      ageAtEntry: 23,
    });

    await page.waitForTimeout(2_000);
    await expect(
      page.getByRole("dialog").filter({
        has: page.getByRole("heading", { name: /member age notice/i }),
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/carried forward|copied|1 year-wise policy found/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await dismissBasePremiumHelperIfOpen();
  });

  test("male already age 25 on prior year does NOT show 25yrs popup", async () => {
    await startRenewWithMember({
      name: "Older Son",
      relationship: "son",
      dob: "2000-01-01",
      gender: "M",
      ageAtEntry: 25,
    });

    await page.waitForTimeout(2_000);
    await expect(
      page.getByRole("dialog").filter({
        has: page.getByRole("heading", { name: /member age notice/i }),
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/carried forward|copied|1 year-wise policy found/i).first(),
    ).toBeVisible({ timeout: 60_000 });
    await dismissBasePremiumHelperIfOpen();
  });
});
