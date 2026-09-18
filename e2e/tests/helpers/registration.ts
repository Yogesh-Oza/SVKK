import { Page, APIRequestContext, expect } from '@playwright/test';
import path from 'path';
import {
  CENTER_HEAD_ID,
  TEAM_LEAD_ID,
  getExecutiveLId,
  pickSelectByName,
} from './auth';

const BASE_URL = process.env.BASE_URL || 'https://prernaacademy.in';

export type CreatedLead = {
  leadId: string;
  ldUniqueId: string;
  email: string;
  phone: string;
};

async function fillByName(page: Page, name: string, value: string) {
  const input = page.locator(`[name="${name}"]`).first();
  await input.scrollIntoViewIfNeeded();
  await input.fill(value);
}

/**
 * Set a MUI Select value by invoking React onChange (works even when
 * MenuItem lists are empty due to cascading data timing/bugs).
 */
export async function setMuiSelectValue(page: Page, name: string, value: string) {
  const ok = await page.evaluate(
    ({ name, value }) => {
      const input = document.querySelector(`[name="${name}"]`);
      if (!input) return false;

      let el: Element | null = input;
      let namedHandler: ((e: any, child?: any) => void) | null = null;
      let anyHandler: ((e: any, child?: any) => void) | null = null;

      while (el) {
        const fiberKey = Object.keys(el).find(
          (k) =>
            k.startsWith('__reactFiber') ||
            k.startsWith('__reactInternalInstance')
        );
        if (fiberKey) {
          let fiber: any = (el as any)[fiberKey];
          while (fiber) {
            const props = fiber.memoizedProps || fiber.pendingProps;
            if (props && typeof props.onChange === 'function') {
              if (props.name === name) {
                namedHandler = props.onChange;
              } else if (!anyHandler) {
                anyHandler = props.onChange;
              }
            }
            fiber = fiber.return;
          }
        }
        el = el.parentElement;
      }

      const handler = namedHandler || anyHandler;
      if (!handler) return false;
      handler({ target: { name, value } });
      return true;
    },
    { name, value }
  );

  expect(ok, `Failed to set select ${name}=${value} via React onChange`).toBeTruthy();
}

/** Create a fresh lead and assign it to the logged-in executive. */
export async function createAssignedLead(
  page: Page,
  request: APIRequestContext
): Promise<CreatedLead> {
  const executiveId = await getExecutiveLId(page);
  const stamp = Date.now();
  const phone = `9${String(stamp).slice(-9)}`;
  const email = `e2e.student.${stamp}@example.com`;

  const createRes = await request.post(`${BASE_URL}/lead/add-lead`, {
    data: {
      fname: 'E2E',
      lname: `Student${stamp}`,
      email,
      phone: Number(phone),
      experience: 0,
      country: 'India',
      state: 'Madhya Pradesh',
      city: 'Indore',
      qualification: 'B.Com',
      passingYear: 2022,
      refBy: 'Website',
      refName: '',
      interestedCourse: 'MBA',
    },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = await createRes.json();

  const assignRes = await request.put(`${BASE_URL}/lead/admin-assign-lead`, {
    data: {
      selectedLeads: [created._id],
      executiveData: {
        executiveId,
        teamLeadId: TEAM_LEAD_ID,
        centerHeadId: CENTER_HEAD_ID,
      },
    },
  });
  expect(assignRes.ok()).toBeTruthy();

  return {
    leadId: created._id,
    ldUniqueId: created.ldUniqueId,
    email,
    phone,
  };
}

/** Step 0: find lead by ID and connect it. */
export async function findAndConnectLead(page: Page, ldUniqueId: string) {
  await page.goto('/dashboard/NewRegistration');
  await expect(page.getByText('FIND LEAD BY')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('radio', { name: 'Lead ID' }).check();
  await page.getByRole('textbox', { name: 'ID' }).fill(ldUniqueId);
  await page.getByRole('button', { name: 'Find' }).click();

  await expect(page.getByText('Record Found!')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Connect This Lead' }).click();
  await expect(page.getByText('Student Details:')).toBeVisible({ timeout: 15_000 });
}

/** Step 1: personal details (uses name= selectors — more reliable than labels). */
export async function fillPersonalDetails(
  page: Page,
  opts: { email: string; phone: string }
) {
  await expect(page.getByText('Student Details:')).toBeVisible();

  await fillByName(page, 'firstName', 'Rahul');
  await fillByName(page, 'lastName', 'Sharma');
  await fillByName(page, 'email', opts.email);
  await fillByName(page, 'contactNumber', opts.phone);
  await fillByName(page, 'dateOfBirth', '2000-01-15');

  await pickSelectByName(page, 'gender', 'Male');

  await fillByName(page, 'whatsappNumber', opts.phone);
  await fillByName(page, 'language', 'Hindi, English');
  await fillByName(page, 'nationality', 'Indian');
  await fillByName(page, 'aadhaar', '234567890123');
  // domicile uses alphabet-only validation (no spaces)
  await fillByName(page, 'domicile', 'MadhyaPradesh');

  await pickSelectByName(page, 'working', 'No');

  await page.getByRole('checkbox', { name: 'Hindu' }).check();
  await page.getByRole('checkbox', { name: 'GEN' }).check();
  await page.getByRole('checkbox', { name: 'Single' }).check();

  await fillByName(page, 'fatherName', 'Raj Sharma');
  await fillByName(page, 'motherName', 'Sunita Sharma');
  await fillByName(page, 'annualIncome', '500000');
  await fillByName(page, 'parentMobileNumber', '9876543211');
  await fillByName(page, 'parentEmail', 'parent.e2e@example.com');

  await fillByName(page, 'presentAddress1', '123 MG Road');
  await fillByName(page, 'presentAddress2', 'Near Square');

  // City dropdown options often fail to render on live (cascading timing).
  // Set both fields through React onChange so the form state is valid.
  await page.getByText('Present Address:', { exact: true }).scrollIntoViewIfNeeded();
  await setMuiSelectValue(page, 'presentState', 'Madhya Pradesh');
  await setMuiSelectValue(page, 'presentCity', 'Indore');

  await fillByName(page, 'presentZipCode', '452001');
  await page.getByRole('checkbox', { name: 'Same as Present Address' }).check();
  await expect(page.locator('[name="permanentAddress1"]')).toHaveValue(
    '123 MG Road',
    { timeout: 5_000 }
  );

  const next = page.getByRole('button', { name: 'Next' });
  await next.scrollIntoViewIfNeeded();
  await next.click();

  // Academic step should appear
  await expect(page.locator('input[name="sscYear"]')).toBeVisible({
    timeout: 20_000,
  });
}

/** Step 2: academic – only 10th row required. */
export async function fillAcademicDetails(page: Page) {
  await expect(page.locator('input[name="sscYear"]')).toBeVisible({
    timeout: 15_000,
  });
  await page.locator('input[name="sscYear"]').fill('2020-03');
  await page.locator('input[name="sscBoardUniversity"]').fill('MP Board');
  await page.locator('input[name="sscDivisionGrade"]').fill('First');
  await page.locator('input[name="sscPercentageCGPA"]').fill('85');
  await page.locator('input[name="sscObtainedMaxTotalMax"]').fill('425');
  await page.locator('input[name="sscTotalMarks"]').fill('500');
  await page.getByRole('button', { name: 'Next' }).click();
}

/** Step 3: course + cash payment (uses live “Demo University” chain). */
export async function fillCourseDetails(page: Page) {
  await expect(
    page.getByRole('heading', { name: 'Course Details' })
  ).toBeVisible({ timeout: 15_000 });

  // Prefer React onChange so cascading dropDownData + handler both run when found
  await setMuiSelectValue(page, 'admissionType', 'Fresher');
  await setMuiSelectValue(page, 'courseCategory', 'Regular');
  await setMuiSelectValue(page, 'universityName', 'Demo University');
  await setMuiSelectValue(page, 'departmentName', 'Management');
  await setMuiSelectValue(page, 'courseName', 'MBA');
  await setMuiSelectValue(page, 'specialization', 'Finance');

  await fillByName(page, 'admissionDate', '2026-01-15');
  await fillByName(page, 'sessionFrom', '2026-01');
  await fillByName(page, 'sessionTo', '2028-01');

  await fillByName(page, 'feesReceived', '10000');
  await fillByName(page, 'regFees', '2000');
  await fillByName(page, 'cautionMoney', '1000');
  await fillByName(page, 'discount', '0');

  await page.getByRole('radio', { name: 'cash' }).check();
  await fillByName(page, 'depositDate', '2026-01-10');
  await fillByName(page, 'slipNo', 'SLIP12345');

  await page.getByRole('button', { name: 'Next' }).click();
}

/** Active university names from API (same filter the UI uses). */
export async function fetchActiveUniversityNames(
  request: APIRequestContext
): Promise<string[]> {
  const res = await request.get(`${BASE_URL}/university`);
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const list = Array.isArray(data) ? data : [];
  return list
    .filter((uni: any) => {
      const status = String(uni?.universityStatus || uni?.status || 'Active');
      return status.toLowerCase() !== 'inactive';
    })
    .map((uni: any) => String(uni?.universityName || uni?.university || '').trim())
    .filter(Boolean);
}

/** Universities that advertise a given course category. */
export async function fetchUniversitiesForCategory(
  request: APIRequestContext,
  category: string
): Promise<string[]> {
  const res = await request.get(`${BASE_URL}/university`);
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  const list = Array.isArray(data) ? data : [];
  const active = list.filter((uni: any) => {
    const status = String(uni?.universityStatus || uni?.status || 'Active');
    return status.toLowerCase() !== 'inactive';
  });
  const normalize = (v: any) =>
    String(v || '')
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-');
  const matched = active.filter((uni: any) =>
    (uni.courseCategory || []).some(
      (item: any) => normalize(item?.type) === normalize(category)
    )
  );
  const source = matched.length ? matched : active;
  return source
    .map((uni: any) => String(uni?.universityName || uni?.university || '').trim())
    .filter(Boolean);
}

/** Read visible options from the University Name dropdown. */
export async function getUniversityDropdownOptions(page: Page): Promise<string[]> {
  // Close any open MUI menu first (avoids reading Course Category options)
  await page.keyboard.press('Escape');

  const byLabel = page.getByRole('combobox', { name: 'University Name' });
  const byId = page.locator('#university-name-select');
  const target =
    (await byLabel.count()) > 0
      ? byLabel.first()
      : (await byId.count()) > 0
        ? byId
        : page
            .locator('.MuiFormControl-root')
            .filter({ has: page.locator('[name="universityName"]') })
            .getByRole('combobox')
            .first();

  await target.scrollIntoViewIfNeeded();
  await target.click();

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible({ timeout: 15_000 });
  const options = listbox.getByRole('option');
  await expect(options.first()).toBeVisible({ timeout: 10_000 });

  const texts = (await options.allTextContents())
    .map((t) => t.trim())
    .filter(Boolean);

  await page.keyboard.press('Escape');
  await expect(listbox).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
  return texts;
}

/** Walk registration wizard to Course Details step. */
export async function goToCourseDetailsStep(
  page: Page,
  request: APIRequestContext
) {
  const lead = await createAssignedLead(page, request);
  const stamp = Date.now();
  await findAndConnectLead(page, lead.ldUniqueId);
  await fillPersonalDetails(page, {
    email: `e2e.uni.${stamp}@example.com`,
    phone: `7${String(stamp).slice(-9)}`,
  });
  await fillAcademicDetails(page);
  await expect(
    page.getByRole('heading', { name: 'Course Details' })
  ).toBeVisible({ timeout: 15_000 });
  await setMuiSelectValue(page, 'admissionType', 'Fresher');
}

/** Step 4: upload photo/signature, check form, submit. */
export async function uploadDocumentsAndSubmit(page: Page) {
  await expect(page.getByRole('heading', { name: 'Upload Documents' })).toBeVisible({
    timeout: 15_000,
  });

  const fixturesDir = path.join(__dirname, '..', '..', 'fixtures');
  await page.locator('input[name="photo"]').setInputFiles(
    path.join(fixturesDir, 'photo.png')
  );
  await page.locator('input[name="signature"]').setInputFiles(
    path.join(fixturesDir, 'signature.png')
  );

  // App has a stale-state quirk: first Check Form sets uploadDocument=true;
  // Submit appears via useEffect. Snackbar "All Correct!" needs a 2nd click.
  await page.getByRole('button', { name: 'Check Form' }).click();
  const submit = page.getByRole('button', { name: 'Submit' });
  if (!(await submit.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Check Form' }).click();
  }
  await expect(submit).toBeVisible({ timeout: 15_000 });
  await submit.click();

  await expect(page.getByText('Successfully Registered!')).toBeVisible({
    timeout: 30_000,
  });
}
