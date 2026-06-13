import type { CsvImportMode } from "@prisma/client";
import { AppError } from "../../errors/app-error.js";
import { normalizeMobile } from "../../domain/phone.js";
import { assertGeoFieldsOnWrite } from "../../services/mis-scope.service.js";
import type { GeoScope } from "../../services/mis-scope.service.js";
import { createPolicyWithYear } from "./policy.service.js";
import {
  collectMembersFromCsvMap,
} from "./policy-csv-slots.js";
import { collectPaymentsFromCsvMap } from "./policy-csv-payment-columns.js";
import { getCsvField, rowToHeaderMap } from "./policy-csv-parse.js";
import {
  buildPolicyTypeCache,
  policyTypeKeyToAdVariant,
  resolveImportPolicyChart,
  resolvePolicyTypeFromCache,
  type PolicyTypeCache,
} from "./policy-csv-resolve.js";
import { buildCombinedRemarksFromParts, parseCsvDate } from "./policy-csv-utils.js";

function parseOptionalDate(raw: string): Date | undefined {
  return parseCsvDate(raw);
}

function parseOptionalDecimal(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid number: ${raw}`);
  return n;
}

function parseOptionalInt(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number.parseInt(t, 10);
  if (Number.isNaN(n)) throw new Error(`invalid integer: ${raw}`);
  return n;
}

const CSV_PAYMENT_MODES = ["NEFT", "UPI", "CHQ", "CASH"] as const;
type CsvPaymentMode = (typeof CSV_PAYMENT_MODES)[number];

function parseCsvPaymentMode(raw: string): CsvPaymentMode | undefined {
  const t = raw.trim().toUpperCase();
  if (!t) return undefined;
  return CSV_PAYMENT_MODES.find((m) => m === t);
}

function requireField(map: Map<string, string>, ...names: string[]): string {
  const v = getCsvField(map, ...names);
  if (!v.trim()) throw new Error(`${names[0]} is required for create`);
  return v.trim();
}

/** Validate row has minimum fields for policy create. */
export function validateCreateRequiredFields(header: string[], row: string[]): void {
  const map = rowToHeaderMap(header, row);
  requireField(map, "Holder name");
  requireField(map, "Village");
  requireField(map, "Product Type");
  requireField(map, "Sum insured");
  requireField(map, "year");
  requireField(map, "month");
  requireField(map, "grouping");
  const mobile = getCsvField(map, "Primary Mobile Number", "whatsapp");
  if (!mobile.trim()) throw new Error("Primary Mobile Number or whatsapp is required for create");
}

/**
 * Create a new policy from a legacy/v2 CSV row (uses createPolicyWithYear — own transaction).
 */
export async function createPolicyFromCsvRow(
  header: string[],
  row: string[],
  ctx: {
    actorUserId: string;
    permissions: Set<string>;
    scope: GeoScope;
    typeCache: PolicyTypeCache;
  },
): Promise<void> {
  if (!ctx.permissions.has("policy:create")) {
    throw new AppError("FORBIDDEN", "policy:create permission required to create policies from CSV", 403);
  }

  const map = rowToHeaderMap(header, row);
  validateCreateRequiredFields(header, row);

  const village = requireField(map, "Village");
  const area = getCsvField(map, "area").trim() || village;
  assertGeoFieldsOnWrite({ village, area }, ctx.scope, ctx.permissions, "policy");

  const productTypeRaw = requireField(map, "Product Type");
  const resolvedType = resolvePolicyTypeFromCache(productTypeRaw, ctx.typeCache);
  if (!resolvedType) {
    throw new Error(
      `Invalid Product Type "${productTypeRaw}". Allowed: ${ctx.typeCache.allowedLabels()}`,
    );
  }

  const sumInsured = parseOptionalDecimal(requireField(map, "Sum insured"));
  if (sumInsured == null) throw new Error("Sum insured is required for create");

  const chartId = await resolveImportPolicyChart(
    (await import("../../lib/prisma.js")).prisma,
    resolvedType.id,
    sumInsured,
  );
  if (!chartId) {
    throw new Error(`No premium chart found for Product Type "${resolvedType.name}"`);
  }

  const mobileRaw =
    getCsvField(map, "Primary Mobile Number") || getCsvField(map, "whatsapp");
  const mobile = normalizeMobile(mobileRaw);
  const emailRaw = getCsvField(map, "email").trim();
  const email = emailRaw.includes("@") ? emailRaw : `${mobile.replace(/\D/g, "").slice(-10)}@import.svkk.local`;

  const members = collectMembersFromCsvMap(map);
  const personsRaw = getCsvField(map, "Person Count*", "Persons insured");
  const personsInsuredCount = parseOptionalInt(personsRaw) ?? Math.max(members.length, 1);

  const payments = collectPaymentsFromCsvMap(map);

  await createPolicyWithYear({
    actorUserId: ctx.actorUserId,
    partyName: requireField(map, "Holder name"),
    email,
    mobile,
    pan: getCsvField(map, "Holder PAN") || undefined,
    aadhaarNo: getCsvField(map, "Holder Aadhaar") || null,
    dateOfBirth: parseOptionalDate(getCsvField(map, "Holder DOB")) ?? null,
    policyTypeId: resolvedType.id,
    yearLabel: requireField(map, "year"),
    policyChartId: chartId,
    policyStart: parseOptionalDate(getCsvField(map, "Policy start")) ?? null,
    policyEnd: parseOptionalDate(getCsvField(map, "Policy end")) ?? null,
    sumInsured,
    policyNo: getCsvField(map, "policy no") || null,
    village,
    area,
    whatsappNo: getCsvField(map, "whatsapp").trim() || mobileRaw.trim(),
    personsInsuredCount,
    periodMonthText: requireField(map, "month"),
    periodYearText: getCsvField(map, "year") || undefined,
    policyGrouping: getCsvField(map, "grouping") || undefined,
    svkkPublicId: getCsvField(map, "SVKK ID") || undefined,
    customerId: getCsvField(map, "Customer ID") || undefined,
    referenceNo: getCsvField(map, "ref no") || undefined,
    previousPolicyNo: getCsvField(map, "previous policy no") || undefined,
    previousEndDate: parseOptionalDate(getCsvField(map, "PRE. END DATE")) ?? null,
    insuranceCompany: getCsvField(map, "Insurance company") || undefined,
    tpa: getCsvField(map, "TPA") || undefined,
    categoryText: getCsvField(map, "Category") || undefined,
    holderGender: getCsvField(map, "Holder gender") || undefined,
    holderRelationship: getCsvField(map, "Holder relationship") || undefined,
    holderAge: parseOptionalInt(getCsvField(map, "Holder age")) ?? undefined,
    nomineeName: getCsvField(map, "nominee_name") || undefined,
    nomineeRelation: getCsvField(map, "nominee_relation") || undefined,
    contactPhone: getCsvField(map, "nominee mobile") || undefined,
    addressLine1: getCsvField(map, "Address Line 1: House/Flat No, Building Name") || undefined,
    addressLine2: getCsvField(map, "Address Line 2: Street/Road Name") || undefined,
    addressLine3: getCsvField(map, "Address Line 3: Landmark / Locality") || undefined,
    addressLine4: getCsvField(map, "Address Line 4: Additional Details (optional)") || undefined,
    city: getCsvField(map, "city") || undefined,
    pincode: getCsvField(map, "pincode") || undefined,
    mobileSecondary: getCsvField(map, "Secondary Mobile Number") || undefined,
    remarks:
      buildCombinedRemarksFromParts(
        getCsvField(map, "gen remark"),
        getCsvField(map, "policy remarK", "policy remar"),
      ) || undefined,
    policyUrl: getCsvField(map, "policy url") || undefined,
    policyUrl2: getCsvField(map, "url") || undefined,
    adProductVariant: policyTypeKeyToAdVariant(resolvedType.key) ?? undefined,
    members,
    payments: payments.length ? payments : undefined,
    paymentMode: parseCsvPaymentMode(
      getCsvField(map, "Payment 1 Mode of Payment", "mode of payment"),
    ),
    grossPremium: parseOptionalDecimal(getCsvField(map, "Gross premium")),
    taxPercent: parseOptionalDecimal(getCsvField(map, "Tax %")),
    taxAmount: parseOptionalDecimal(getCsvField(map, "Tax amount")),
    svkkPremium: parseOptionalDecimal(getCsvField(map, "SVKK premium")),
    netPremium: parseOptionalDecimal(getCsvField(map, "Net premium")),
    vkkCommission: parseOptionalDecimal(getCsvField(map, "VKK commission")),
    commissionAmount: parseOptionalDecimal(getCsvField(map, "Commission amount")),
    yearPolicyHolderPremium: parseOptionalDecimal(getCsvField(map, "Policy Holder Premium")),
  });
}

export async function buildPolicyTypeCacheForImport(): Promise<PolicyTypeCache> {
  const { prisma } = await import("../../lib/prisma.js");
  return buildPolicyTypeCache(prisma);
}

export type { CsvImportMode };
