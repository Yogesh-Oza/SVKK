"use client";

import { useMemo } from "react";
import { parsePolicyUrls, parseRemarks } from "@/features/svkk-policies/ad-policy-detail-to-form";
import {
  resolvePolicyPaymentDisplays,
} from "@/features/svkk-policies/policy-bank-display";
import {
  displayVal,
  genderLabel,
  ViewFieldTable,
  ViewSectionBlock,
  ViewSubsection,
  VIEW_TD_CLASS,
  VIEW_TH_CLASS,
  yesNoLabel,
} from "@/features/svkk-policies/policy-detail-view-helpers";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import {
  buildCategoryByKeyMap,
  resolveCategoryDisplayLabel,
} from "@/lib/svkk/category-display";
import { useDropdownOptions } from "@/lib/svkk/use-dropdown-options";
import { canSeeCommission } from "@/lib/svkk/permissions";

export type PolicyDetailViewRow = {
  policyNo: string | null;
  referenceNo: string | null;
  village: string | null;
  area: string | null;
  remarks: string | null;
  adProductVariant: string | null;
  personsInsuredCount: number | null;
  insuranceCompany: string | null;
  tpa: string | null;
  periodYearText: string | null;
  periodMonthText: string | null;
  policyGroup?: string | null;
  policyGrouping: string | null;
  policyUrl: string | null;
  policyUrl2: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine4: string | null;
  city: string | null;
  pincode: string | null;
  contactPhone: string | null;
  whatsappNo: string | null;
  mobileSecondary?: string | null;
  nomineeName: string | null;
  nomineeRelation: string | null;
  holderRelationship?: string | null;
  holderGender?: string | null;
  holderJoiningDate?: string | null;
  holderAge?: number | null;
  holderAddOns?: unknown;
  previousPolicyNo?: string | null;
  previousEndDate?: string | null;
  categoryText?: string | null;
  loanStatus?: string | null;
  loanAmount?: unknown;
  refundChequeAmount?: unknown;
  refundChequeNo?: string | null;
  refundChequeDate?: string | null;
  cdAccountUsed?: boolean | null;
  cdAmount?: unknown;
  courierStatus?: string | null;
  courierDate?: string | null;
  courierCompany?: string | null;
  podNumber?: string | null;
  courierAddress?: string | null;
  insuredParty: {
    svkkPublicId: string;
    name: string;
    mobile: string;
    email: string | null;
    customerId: string | null;
    pan: string | null;
    aadhaarNo: string | null;
    dateOfBirth: string | null;
  };
  policyType: { name: string };
  category: { key: string; name: string } | null;
  years: PolicyDetailViewYear[];
};

export type PolicyDetailViewYear = {
  id: string;
  yearLabel: string;
  sumInsured: unknown;
  vkkPremium: unknown;
  expectedNetPremium?: unknown;
  grossPremium?: unknown;
  commissionAmount?: unknown;
  twoLacFloater?: unknown;
  premiumOneOrTwoLakh?: unknown;
  yearPolicyHolderPremium?: unknown;
  gaamMahajanVkk?: unknown;
  gaamMahajanContribution?: unknown;
  excessShortAmount?: unknown;
  diffPaidByHolder?: unknown;
  differenceAmountPaidByHolder?: unknown;
  holderBasicPremium?: unknown;
  holderCumulativeBonus: unknown;
  holderJoiningYear: string | null;
  taxPercent?: unknown;
  taxAmount?: unknown;
  svkkPremium?: unknown;
  netPremium?: unknown;
  vkkCommission?: unknown;
  policyStart: string | null;
  policyEnd: string | null;
  members: Array<{
    name: string;
    relationship: string;
    dob: string;
    gender?: string;
    sumInsured?: unknown;
    cumulativeBonus?: unknown;
    dateOfJoining?: string | null;
    memberPhone?: string | null;
    addOnsAmount?: unknown;
    basicPremium?: unknown;
    ageAtEntry?: number | null;
  }>;
  payments?: Array<{
    method?: string;
    amount?: unknown;
    transactionNumber?: string | null;
    transactionDate?: string | null;
    bankName?: string | null;
    branchName?: string | null;
    accountNumber?: string | null;
    nameAsPerCheque?: string | null;
    ifscCode?: string | null;
    notOver?: string | null;
    dishonourReason?: string | null;
    returnCharges?: unknown;
    otherCharges?: unknown;
    status?: string | null;
    cheque?: {
      number: string;
      bankName: string;
      ifsc?: string | null;
      accountNo?: string | null;
      branch?: string | null;
      nameAsPerCheque?: string | null;
      notOver?: string | null;
      chequeDate?: string | null;
      status?: string | null;
      reason?: string | null;
    } | null;
  }>;
};

function dStr(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && "toString" in v) {
    return (v as { toString: () => string }).toString();
  }
  return String(v);
}

function formatNumIn(v: unknown): string {
  const s = dStr(v).replace(/,/g, "").trim();
  if (!s) return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString("en-IN");
}

function formatDateIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateDmy(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const y = d.getFullYear();
  return `${day}-${m}-${y}`;
}

function holderAge(row: PolicyDetailViewRow): string {
  if (row.holderAge != null) return String(row.holderAge);
  if (!row.insuredParty.dateOfBirth) return "";
  const d = new Date(row.insuredParty.dateOfBirth);
  if (Number.isNaN(d.getTime())) return "";
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a -= 1;
  return a >= 0 ? String(a) : "";
}

function PolicyUrlLinks({ policyUrl }: { policyUrl: string | null }) {
  const urls = parsePolicyUrls(policyUrl);
  if (urls.length === 0) return displayVal(null);
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {urls.map((u, i) => (
        <a
          key={i}
          href={u}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary break-all underline"
        >
          {u}
        </a>
      ))}
    </div>
  );
}

function PolicyUrl2Link({ url }: { url: string | null }) {
  if (!url?.trim()) return displayVal(null);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary break-all underline">
      {url}
    </a>
  );
}

export function PolicyDetailViewBody({
  row,
  y,
  activeYearLabel,
  policyTypeLabel,
}: {
  row: PolicyDetailViewRow;
  y: PolicyDetailViewYear | undefined;
  activeYearLabel: string;
  policyTypeLabel: string;
}) {
  const { user } = useSvkkAuth();
  const { options } = useDropdownOptions();
  const categoryByKey = useMemo(
    () =>
      buildCategoryByKeyMap(
        options.categories.map((c) => ({
          key: c.value,
          name: c.label,
        })),
      ),
    [options.categories],
  );
  const allowCommission = user?.permissions ? canSeeCommission(user.permissions) : false;
  const fmt = (v: unknown) => displayVal(formatNumIn(v) || dStr(v));
  const fmtDate = (iso: string | null | undefined) => displayVal(iso ? formatDateIso(iso) : "");
  const fmtDob = (iso: string | null | undefined) => displayVal(iso ? formatDateDmy(iso) : "");
  const categoryLabel = resolveCategoryDisplayLabel(
    row.category,
    row.categoryText,
    categoryByKey,
  );
  const { generalRemark, policyChangeRemark, categoryChangeRemark } = parseRemarks(row.remarks);
  const paymentDisplays = resolvePolicyPaymentDisplays(y, formatNumIn);

  const refundDateRaw = row.refundChequeDate ? formatDateIso(row.refundChequeDate) : "";
  const refundDateDisplay =
    refundDateRaw === "0000-01-01" || refundDateRaw.startsWith("0000-00")
      ? "0000-00-00"
      : refundDateRaw;

  const holderJoiningDisplay = row.holderJoiningDate
    ? formatDateIso(row.holderJoiningDate)
    : y?.holderJoiningYear ?? "";

  return (
    <>
      <ViewSectionBlock title="Policy Details">
        <ViewSubsection title="Policy Details">
          <ViewFieldTable
            cols={5}
            fields={[
              { label: "Customer ID", value: displayVal(row.insuredParty.customerId) },
              { label: "Policy No", value: displayVal(row.policyNo) },
              { label: "Policy Type", value: displayVal(policyTypeLabel) },
              { label: "Policy Start Date", value: fmtDate(y?.policyStart) },
              { label: "Policy End Date", value: fmtDate(y?.policyEnd) },
              { label: "Previous Policy No", value: displayVal(row.previousPolicyNo) },
              { label: "Previous End Date (Age anchor)", value: fmtDate(row.previousEndDate) },
              { label: "Sum Insured (SI)", value: fmt(y?.sumInsured) },
              { label: "Person Count", value: displayVal(row.personsInsuredCount) },
              { label: "Cumulative Bonus", value: fmt(y?.holderCumulativeBonus) },
              { label: "Insurance Company", value: displayVal(row.insuranceCompany) },
              { label: "TPA", value: displayVal(row.tpa) },
            ]}
          />
        </ViewSubsection>
        <ViewSubsection title="SVKK Details">
          <ViewFieldTable
            cols={5}
            fields={[
              { label: "SVKK ID", value: displayVal(row.insuredParty.svkkPublicId) },
              { label: "Reference No", value: displayVal(row.referenceNo) },
              { label: "Category", value: displayVal(categoryLabel) },
              { label: "Month", value: displayVal(row.periodMonthText) },
              { label: "Year", value: displayVal(activeYearLabel || row.periodYearText) },
              { label: "Village", value: displayVal(row.village) },
              { label: "Area", value: displayVal(row.area) },
              { label: "Group", value: displayVal(row.policyGroup ?? row.policyGrouping) },
              { label: "Policy URL", value: <PolicyUrlLinks policyUrl={row.policyUrl} /> },
              { label: "URL", value: <PolicyUrl2Link url={row.policyUrl2} /> },
            ]}
          />
        </ViewSubsection>
      </ViewSectionBlock>

      <ViewSectionBlock title="Policy Holder Details">
        <ViewSubsection title="Holder Details">
          <ViewFieldTable
            cols={5}
            fields={[
              { label: "Name", value: displayVal(row.insuredParty.name) },
              { label: "DOB", value: fmtDob(row.insuredParty.dateOfBirth) },
              { label: "Age", value: displayVal(holderAge(row)) },
              { label: "Village", value: displayVal(row.village) },
              { label: "Gender", value: genderLabel(row.holderGender) },
              { label: "Relation", value: displayVal(row.holderRelationship) },
            ]}
          />
        </ViewSubsection>
        <ViewSubsection title="Document Details">
          <ViewFieldTable
            cols={5}
            fields={[
              { label: "PAN", value: displayVal(row.insuredParty.pan) },
              { label: "Aadhaar", value: displayVal(row.insuredParty.aadhaarNo) },
            ]}
          />
        </ViewSubsection>
        <ViewSubsection title="Policy Details">
          <ViewFieldTable
            cols={5}
            fields={[
              { label: "Joining Date", value: displayVal(holderJoiningDisplay) },
              { label: "Add-ons (Amount rs)", value: fmt(row.holderAddOns) },
              { label: "Basic Premium", value: fmt(y?.holderBasicPremium) },
            ]}
          />
        </ViewSubsection>
      </ViewSectionBlock>

      <ViewSectionBlock title="Members Details">
        <ViewSubsection>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead>
                <tr>
                  {[
                    "Member name",
                    "Relation",
                    "Date of birth",
                    "Age",
                    "Gender",
                    "Joining date",
                    "Sum insured",
                    "Cumulative bonus",
                    "Phone no",
                    "Add ons",
                    "Basic premium",
                  ].map((h) => (
                    <th key={h} className={VIEW_TH_CLASS}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(y?.members ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={11} className={VIEW_TD_CLASS}>
                      {displayVal(null)}
                    </td>
                  </tr>
                ) : (
                  (y?.members ?? []).map((m) => (
                    <tr key={`${m.name}-${m.dob}`}>
                      <td className={VIEW_TD_CLASS}>{displayVal(m.name)}</td>
                      <td className={VIEW_TD_CLASS}>{displayVal(m.relationship)}</td>
                      <td className={VIEW_TD_CLASS}>{fmtDate(m.dob)}</td>
                      <td className={VIEW_TD_CLASS}>{displayVal(m.ageAtEntry)}</td>
                      <td className={VIEW_TD_CLASS}>{genderLabel(m.gender)}</td>
                      <td className={VIEW_TD_CLASS}>{fmtDate(m.dateOfJoining)}</td>
                      <td className={VIEW_TD_CLASS}>{fmt(m.sumInsured)}</td>
                      <td className={VIEW_TD_CLASS}>{fmt(m.cumulativeBonus)}</td>
                      <td className={VIEW_TD_CLASS}>{displayVal(m.memberPhone)}</td>
                      <td className={VIEW_TD_CLASS}>{fmt(m.addOnsAmount)}</td>
                      <td className={VIEW_TD_CLASS}>{fmt(m.basicPremium)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ViewSubsection>
      </ViewSectionBlock>

      <ViewSectionBlock title="Contact Details">
        <ViewSubsection>
          <ViewFieldTable
            cols={4}
            minWidth="720px"
            fields={[
              { label: "Address Line 1", value: displayVal(row.addressLine1) },
              { label: "Address Line 2", value: displayVal(row.addressLine2) },
              { label: "Address Line 3", value: displayVal(row.addressLine3) },
              { label: "Address Line 4", value: displayVal(row.addressLine4) },
              { label: "Area", value: displayVal(row.area) },
              { label: "City", value: displayVal(row.city) },
              { label: "PIN Code", value: displayVal(row.pincode) },
              { label: "Primary Mobile Number", value: displayVal(row.insuredParty.mobile) },
              { label: "Secondary Mobile Number", value: displayVal(row.mobileSecondary) },
              { label: "WhatsApp Number", value: displayVal(row.whatsappNo) },
              { label: "Email ID", value: displayVal(row.insuredParty.email) },
            ]}
          />
        </ViewSubsection>
      </ViewSectionBlock>

      <ViewSectionBlock title="Premium Details">
        <ViewSubsection>
          <ViewFieldTable
            cols={4}
            minWidth="720px"
            fields={[
              { label: "Gross Premium", value: fmt(y?.grossPremium) },
              { label: "Taxes - %", value: fmt(y?.taxPercent) },
              { label: "TAXES AMOUNT", value: fmt(y?.taxAmount) },
              { label: "SVKK Premium", value: fmt(y?.svkkPremium ?? y?.vkkPremium) },
              { label: "Net Premium", value: fmt(y?.expectedNetPremium ?? y?.netPremium) },
              ...(allowCommission
                ? [
                    { label: "Commission", value: fmt(y?.commissionAmount) },
                    { label: "VKK Commission", value: fmt(y?.vkkCommission) },
                  ]
                : []),
              { label: "Policy Holder Premium", value: fmt(y?.yearPolicyHolderPremium) },
              {
                label: "Premium (1 Lakh Individual / 2 Lakh Floater)",
                value: fmt(y?.twoLacFloater ?? y?.premiumOneOrTwoLakh),
              },
              {
                label: "Contribution (Gaam Mahajan / VKK)",
                value: fmt(y?.gaamMahajanContribution ?? y?.gaamMahajanVkk),
              },
              { label: "Excess / Short Amount", value: fmt(y?.excessShortAmount) },
              {
                label: "Difference Amount Paid by Policyholder",
                value: fmt(y?.differenceAmountPaidByHolder ?? y?.diffPaidByHolder),
              },
            ]}
          />
        </ViewSubsection>
      </ViewSectionBlock>

      <ViewSectionBlock title="Payment & Bank Details">
        {paymentDisplays.length === 0 ? (
          <ViewSubsection>
            <p className="text-muted-foreground text-sm">{displayVal(null)}</p>
          </ViewSubsection>
        ) : (
          <div className="space-y-4">
            {paymentDisplays.map((payment) => (
              <ViewSubsection
                key={payment.index}
                title={`Transaction ${payment.index}${payment.modeLabel ? ` · ${payment.modeLabel}` : ""}${payment.amount ? ` · ₹ ${payment.amount}` : ""}`}
              >
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <tbody>
                    {Array.from({ length: Math.ceil(payment.fields.length / 2) }).map((_, rowIdx) => {
                      const left = payment.fields[rowIdx * 2];
                      const right = payment.fields[rowIdx * 2 + 1];
                      return (
                        <tr key={`${payment.index}-${rowIdx}`}>
                          <th className={VIEW_TH_CLASS}>{left?.label ?? ""}</th>
                          <td className={VIEW_TD_CLASS}>
                            {left?.label.toLowerCase().includes("date")
                              ? displayVal(formatDateIso(left.value) || left.value)
                              : displayVal(left?.value)}
                          </td>
                          <th className={VIEW_TH_CLASS}>{right?.label ?? ""}</th>
                          <td className={VIEW_TD_CLASS}>
                            {right
                              ? right.label.toLowerCase().includes("date")
                                ? displayVal(formatDateIso(right.value) || right.value)
                                : displayVal(right.value)
                              : displayVal(null)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ViewSubsection>
            ))}
          </div>
        )}
      </ViewSectionBlock>

      <ViewSectionBlock title="Nominee Details">
        <ViewSubsection>
          <ViewFieldTable
            cols={3}
            minWidth="480px"
            fields={[
              { label: "Nominee Name", value: displayVal(row.nomineeName) },
              { label: "Nominee Relation", value: displayVal(row.nomineeRelation) },
              { label: "Nominee Phone number ( one number )", value: displayVal(row.contactPhone) },
            ]}
          />
        </ViewSubsection>
      </ViewSectionBlock>

      <ViewSectionBlock title="Loan / CD / Refund">
        <ViewSubsection title="Loan">
          <ViewFieldTable
            cols={4}
            fields={[
              { label: "Loan Taken (Yes/No)", value: yesNoLabel(row.loanStatus) },
              { label: "Loan Amount", value: fmt(row.loanAmount) },
            ]}
          />
        </ViewSubsection>
        <ViewSubsection title="CD">
          <ViewFieldTable
            cols={4}
            fields={[
              { label: "CD Account Used", value: yesNoLabel(row.cdAccountUsed) },
              { label: "CD Amount", value: fmt(row.cdAmount) },
            ]}
          />
        </ViewSubsection>
        <ViewSubsection title="Refund">
          <ViewFieldTable
            cols={4}
            fields={[
              { label: "Refund Cheque Amount", value: fmt(row.refundChequeAmount) },
              { label: "Refund Cheque Number", value: displayVal(row.refundChequeNo) },
              { label: "Refund Cheque Date", value: displayVal(refundDateDisplay) },
            ]}
          />
        </ViewSubsection>
      </ViewSectionBlock>

      <ViewSectionBlock title="Courier Details">
        <ViewSubsection>
          <ViewFieldTable
            cols={4}
            minWidth="720px"
            fields={[
              { label: "Courier Status (YES/NO)", value: yesNoLabel(row.courierStatus) },
              { label: "Courier Date", value: fmtDate(row.courierDate) },
              { label: "Courier Company", value: displayVal(row.courierCompany) },
              { label: "POD Number", value: displayVal(row.podNumber) },
              { label: "Courier Address", value: displayVal(row.courierAddress) },
            ]}
          />
        </ViewSubsection>
      </ViewSectionBlock>

      <ViewSectionBlock title="Remark">
        <ViewSubsection>
          <ViewFieldTable
            cols={2}
            minWidth="480px"
            fields={[
              { label: "General Remark", value: displayVal(generalRemark) },
              { label: "Policy Change Remark", value: displayVal(policyChangeRemark) },
              { label: "Category Change Remark", value: displayVal(categoryChangeRemark) },
            ]}
          />
        </ViewSubsection>
      </ViewSectionBlock>
    </>
  );
}
