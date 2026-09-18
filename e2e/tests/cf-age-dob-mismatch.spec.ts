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
 * Live repro: after Carry Forward, Member tab age is +1 and may not match DOB.
 *
 * Run headed:
 *   cd e2e && npx playwright test tests/cf-age-dob-mismatch.spec.ts --headed
 */

function completedAge(dobIso: string, anchorIso: string): number | null {
  const dob = new Date(dobIso);
  const anchor = new Date(anchorIso);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(anchor.getTime())) return null;
  let years = anchor.getFullYear() - dob.getFullYear();
  const before =
    anchor.getMonth() < dob.getMonth() ||
    (anchor.getMonth() === dob.getMonth() && anchor.getDate() < dob.getDate());
  if (before) years -= 1;
  return years >= 0 ? years : null;
}

test.describe("Live CF – member age vs DOB mismatch", () => {
  test.setTimeout(180_000);

  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    ({ context, page } = await openFreshChromeSession(browser));
  });

  test.afterEach(async () => {
    await context?.close();
  });

  test("after CF, Members tab age should match DOB (live check)", async () => {
    // Prior end 15-06-2025: DOB 01-01-1985 → age 40 (not 41).
    // Blind +1 from ageAtEntry 40 → 41 = mismatch with DOB.
    await loginAsSvkkAdmin(page);
    await mockAge25CarryForwardApis(page, {
      name: "Ravi Kumar",
      relationship: "son",
      dob: "2001-06-15",
      gender: "M",
      ageAtEntry: 24,
    });

    await page.goto(`/policies/new?svkk=${E2E_SVKK_ID}&renew=1`, {
      waitUntil: "domcontentloaded",
    });

    const ageDialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: /member age notice/i }),
    });
    if (await ageDialog.isVisible({ timeout: 20_000 }).catch(() => false)) {
      await ageDialog.getByRole("button", { name: /^ok$/i }).click();
      await expect(ageDialog).toBeHidden({ timeout: 15_000 });
    }

    // Dismiss Category B/C helper if it appears.
    const dismiss = page.getByRole("button", { name: /^dismiss$/i });
    if (await dismiss.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await dismiss.click({ force: true }).catch(() => undefined);
    }

    await expect(page.getByText(/carried forward|copied|1 year-wise/i).first()).toBeVisible({
      timeout: 60_000,
    });

    const membersNav = page.getByRole("button", { name: /members details/i });
    await expect(membersNav).toBeVisible({ timeout: 20_000 });
    await membersNav.click();

    const dobInput = page.locator('input[name="members[0].dob"]');
    const ageInput = page.locator('input[name="members[0].age"]');
    await expect(ageInput).toBeVisible({ timeout: 20_000 });

    const dobRaw = (await dobInput.inputValue()).trim();
    const ageRaw = (await ageInput.inputValue()).trim();
    const prevEnd = (await page.locator('input[name="previousEndDate"]').inputValue().catch(() => "")).trim();
    const policyEnd = (await page.locator('input[name="policyEnd"]').inputValue().catch(() => "")).trim();

    // Normalize DD-MM-YYYY → ISO for completed-age math.
    const toIso = (v: string) => {
      const m = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      return v;
    };
    const dobIso = toIso(dobRaw);
    const priorAnchor = toIso(prevEnd || "2025-06-15");
    const ageAtPriorEnd = completedAge(dobIso, priorAnchor);
    const ageNum = Number(ageRaw);

    console.log(
      JSON.stringify(
        {
          dobRaw,
          ageRaw,
          prevEnd,
          policyEnd,
          ageAtPriorEnd,
          looksLikeBlindPlusOne: ageAtPriorEnd != null && ageNum === ageAtPriorEnd + 1,
        },
        null,
        2,
      ),
    );

    // Product rule after fix: keep prior-year age (match DOB at previousEndDate).
    // Live bug (earlier patch): age is prior+1 → fails this assert.
    expect(
      ageNum,
      `Member age ${ageRaw} should match DOB ${dobRaw} at previousEnd ${prevEnd || priorAnchor} (expected ${ageAtPriorEnd}). Blind +1 on CF is the live bug.`,
    ).toBe(ageAtPriorEnd);
  });
});
