"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { parsePolicyUrls, parseRemarks } from "@/features/svkk-policies/ad-policy-detail-to-form";
import {
  type PolicyDetailViewRow,
  type PolicyDetailViewYear,
} from "@/features/svkk-policies/policy-detail-view-body";
import {
  displayVal,
  formatViewDateDmy,
  genderLabel,
  yesNoLabel,
} from "@/features/svkk-policies/policy-detail-view-helpers";
import { resolvePolicyPaymentDisplays } from "@/features/svkk-policies/policy-bank-display";
import {
  buildCategoryByKeyMap,
  resolveCategoryDisplayLabel,
} from "@/lib/svkk/category-display";
import { canSeeCommission } from "@/lib/svkk/permissions";
import { useDropdownOptions } from "@/lib/svkk/use-dropdown-options";
import { cn } from "@/lib/utils";
import {
  Award,
  Building2,
  Calendar,
  Download,
  FileText,
  Handshake,
  IndianRupee,
  Pencil,
  Printer,
  RefreshCw,
  Shield,
  ShieldCheck,
  Umbrella,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { PolicyListYearSibling } from "@/features/svkk-policies/policy-year-siblings";
import { PolicyProfileClaimsTab } from "@/features/svkk-policies/policy-profile-claims-tab";
import { yearChipLabel } from "@/features/svkk-policies/policy-year-display";

/** Corporate blue palette aligned with insurance dashboard reference */
const profileTheme = {
  page: "rounded-xl bg-[#F9FAFB] p-4 sm:p-6",
  heading: "text-[#1e3a8a]",
  subtext: "text-[#6B7280]",
  card: "rounded-xl border border-[#E5E7EB] bg-white shadow-sm",
  cardTitle: "text-[#1e40af]",
  iconCircle: "bg-[#EFF6FF] text-[#2563EB]",
  icon: "text-[#2563EB]",
  value: "text-[#1F2937] font-semibold",
  valueMuted: "text-[#1F2937] font-medium",
  label: "text-[#6B7280]",
  accentValue: "text-[#2563EB] font-semibold",
  moneyValue: "text-[#059669] font-semibold",
  btnOutline:
    "border-[#BFDBFE] bg-white text-[#2563EB] shadow-none hover:bg-[#EFF6FF] hover:text-[#1D4ED8]",
  btnRenew:
    "border-emerald-200 bg-white text-[#059669] shadow-none hover:bg-emerald-50 hover:text-emerald-700",
  tabActive: "border-[#2563EB] text-[#2563EB] font-semibold",
  tabInactive: "text-[#6B7280] hover:text-[#2563EB]",
  sectionTitle: "text-[#1e40af] font-semibold",
  tableHead: "bg-[#F3F4F6] text-[#6B7280]",
};

function paymentAmountLabel(amount: string): string {
  const s = amount.replace(/,/g, "").trim();
  if (!s || s === "0" || Number(s) === 0) return "";
  return ` · ₹ ${amount}`;
}

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
  if (n === 0) return "";
  return n.toLocaleString("en-IN");
}

function fmtAmount(v: unknown): string {
  const formatted = formatNumIn(v);
  if (formatted) return displayVal(formatted);
  const s = dStr(v).replace(/,/g, "").trim();
  if (!s || (Number.isFinite(Number(s)) && Number(s) === 0)) return displayVal(null);
  return displayVal(s);
}

function formatInr(v: unknown): string {
  const n = formatNumIn(v);
  return n ? `₹${n}` : "";
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
  if (row.holderAge != null) return `${row.holderAge} Years`;
  if (!row.insuredParty.dateOfBirth) return "";
  const d = new Date(row.insuredParty.dateOfBirth);
  if (Number.isNaN(d.getTime())) return "";
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a -= 1;
  return a >= 0 ? `${a} Years` : "";
}

function holderInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function policyStatus(y: PolicyDetailViewYear | undefined): {
  label: string;
  className: string;
} {
  if (!y?.policyEnd) {
    return {
      label: "Active Policy",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  const end = new Date(y.policyEnd);
  if (!Number.isNaN(end.getTime()) && end >= new Date()) {
    return {
      label: "Active Policy",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  return {
    label: "Expired",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  };
}

function SummaryStatCard({
  icon,
  label,
  value,
  highlightValue,
  iconVariant = "blue",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  highlightValue?: boolean;
  iconVariant?: "blue" | "green";
}) {
  const iconWrap =
    iconVariant === "green" ? "bg-[#ECFDF5] text-[#059669]" : profileTheme.iconCircle;
  return (
    <Card className={cn(profileTheme.card, "border-none")}>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", iconWrap)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className={cn("text-xs font-medium", profileTheme.label)}>{label}</p>
          <p
            className={cn(
              "mt-0.5 text-sm leading-snug wrap-break-word",
              highlightValue ? profileTheme.accentValue : profileTheme.value,
            )}
          >
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailField({
  icon,
  label,
  value,
  valueClassName,
  monetary,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  monetary?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className={cn("mt-0.5 shrink-0 [&>svg]:size-4", profileTheme.icon)}>{icon}</div>
      <div className="min-w-0">
        <p className={cn("text-xs", profileTheme.label)}>{label}</p>
        <p
          className={cn(
            "mt-0.5 text-sm wrap-break-word",
            profileTheme.valueMuted,
            monetary && "tabular-nums",
            valueClassName,
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 border-t border-[#E5E7EB] pt-6">
      <h3 className={cn("mb-4 text-sm", profileTheme.sectionTitle)}>{title}</h3>
      {children}
    </section>
  );
}

function SubsectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className={cn("mb-3 text-xs font-semibold uppercase tracking-wider", profileTheme.label)}>
      {children}
    </p>
  );
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
          className="text-[#2563EB] break-all text-sm underline"
        >
          Document {i + 1}
        </a>
      ))}
    </div>
  );
}

export function PolicyProfileView({
  row,
  y,
  activeYearLabel,
  policyTypeLabel,
  createdAt,
  yearTabs,
  currentPolicyId,
  onSelectYear,
  canEdit,
  editHref,
  renewHref,
  onDownload,
  onPrint,
  receiptBusy,
  switchingYear,
}: {
  row: PolicyDetailViewRow;
  y: PolicyDetailViewYear | undefined;
  activeYearLabel: string;
  policyTypeLabel: string;
  createdAt?: string | null;
  yearTabs: PolicyListYearSibling[];
  currentPolicyId: string;
  onSelectYear: (tab: PolicyListYearSibling) => void;
  canEdit: boolean;
  editHref: string;
  renewHref: string;
  onDownload: () => void;
  onPrint: () => void;
  receiptBusy: boolean;
  switchingYear?: boolean;
}) {
  const { user } = useSvkkAuth();
  const { options } = useDropdownOptions();
  const [tab, setTab] = useState("policy");

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
  const fmt = fmtAmount;
  const fmtDate = (iso: string | null | undefined) => displayVal(iso ? formatDateIso(iso) : "");
  const fmtDob = (iso: string | null | undefined) => displayVal(iso ? formatDateDmy(iso) : "");
  const categoryLabel = resolveCategoryDisplayLabel(row.category, row.categoryText, categoryByKey);
  const { generalRemark, policyChangeRemark, categoryChangeRemark } = parseRemarks(row.remarks);
  const paymentDisplays = resolvePolicyPaymentDisplays(y, formatNumIn);
  const status = policyStatus(y);

  const holderJoiningDisplay = row.holderJoiningDate
    ? formatDateIso(row.holderJoiningDate)
    : (y?.holderJoiningYear ?? "");

  const refundDateRaw = row.refundChequeDate ? formatDateIso(row.refundChequeDate) : "";
  const refundDateDisplay =
    refundDateRaw === "0000-01-01" || refundDateRaw.startsWith("0000-00")
      ? ""
      : formatDateDmy(row.refundChequeDate);

  const periodLabel =
    y?.policyStart && y?.policyEnd
      ? `${formatViewDateDmy(y.policyStart)} to ${formatViewDateDmy(y.policyEnd)}`
      : displayVal(null);

  return (
    <div className={cn(profileTheme.page, "space-y-6", switchingYear && "pointer-events-none opacity-60")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className={cn("text-2xl font-bold tracking-tight sm:text-3xl", profileTheme.heading)}>Policy Profile</h1>
          <p className={cn("mt-1 flex items-center gap-2 text-sm", profileTheme.subtext)}>
            <FileText className={cn("size-4", profileTheme.icon)} />
            Policy Details &amp; Information
          </p>
          {createdAt ? (
            <p className={cn("mt-1 text-xs", profileTheme.subtext)}>
              Generated {displayVal(formatViewDateDmy(createdAt))}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {canEdit ? (
            <Button asChild variant="outline" size="sm" className={cn("gap-1.5", profileTheme.btnOutline)}>
              <Link href={editHref}>
                <Pencil className="size-3.5" />
                Edit Policy
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className={cn("gap-1.5", profileTheme.btnRenew)}>
            <Link href={renewHref}>
              <RefreshCw className="size-3.5" />
              Renew
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("gap-1.5", profileTheme.btnOutline)}
            disabled={receiptBusy}
            onClick={onDownload}
          >
            <Download className="size-3.5" />
            Download
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("gap-1.5", profileTheme.btnOutline)}
            disabled={receiptBusy}
            onClick={onPrint}
          >
            <Printer className="size-3.5" />
            Print
          </Button>
        </div>
      </div>

      {yearTabs.length > 1 ? (
        <div className="space-y-2">
          <p className={cn("text-xs font-medium uppercase tracking-wide", profileTheme.label)}>Select year</p>
          <div className="flex flex-wrap gap-2">
            {yearTabs.map((tabItem) => {
              const active = tabItem.policyId === currentPolicyId;
              return (
                <Button
                  key={tabItem.policyId}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-auto px-3 py-2",
                    active
                      ? "bg-[#2563EB] text-white hover:bg-[#1D4ED8]"
                      : profileTheme.btnOutline,
                  )}
                  onClick={() => onSelectYear(tabItem)}
                >
                  <span className="font-semibold tabular-nums">{yearChipLabel(tabItem)}</span>
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <SummaryStatCard icon={<User className="size-4" />} label="Customer ID" value={displayVal(row.insuredParty.customerId)} />
        <SummaryStatCard icon={<Shield className="size-4" />} label="Policy No" value={displayVal(row.policyNo)} />
        <SummaryStatCard icon={<Umbrella className="size-4" />} label="Policy Type" value={displayVal(policyTypeLabel)} />
        <SummaryStatCard icon={<Calendar className="size-4" />} label="Policy Period" value={periodLabel} />
        <SummaryStatCard
          icon={<IndianRupee className="size-4" />}
          label="Sum Insured"
          value={displayVal(formatInr(y?.sumInsured) || fmt(y?.sumInsured))}
          highlightValue
        />
        <SummaryStatCard icon={<Users className="size-4" />} label="Person Count" value={displayVal(row.personsInsuredCount)} />
        <SummaryStatCard
          icon={<ShieldCheck className="size-4" />}
          label="Status"
          iconVariant="green"
          value={
            <Badge variant="outline" className={cn("font-medium", status.className)}>
              {status.label}
            </Badge>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={profileTheme.card}>
          <CardHeader className="pb-3">
            <CardTitle className={cn("flex items-center gap-2 text-base", profileTheme.cardTitle)}>
              <User className={cn("size-4", profileTheme.icon)} />
              Policy Holder Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div
                className={cn(
                  "flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold",
                  profileTheme.iconCircle,
                )}
              >
                {holderInitials(row.insuredParty.name) || "PH"}
              </div>
              <div>
                <p className={cn("text-lg font-semibold", profileTheme.value)}>{displayVal(row.insuredParty.name)}</p>
                <Badge variant="outline" className="mt-1 border-emerald-200 bg-emerald-50 text-emerald-700">
                  Primary Policy Holder
                </Badge>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField icon={<Calendar className="size-4" />} label="DOB" value={fmtDob(row.insuredParty.dateOfBirth)} />
              <DetailField icon={<User className="size-4" />} label="Age" value={displayVal(holderAge(row))} />
              <DetailField icon={<Building2 className="size-4" />} label="Village" value={displayVal(row.village)} />
              <DetailField icon={<User className="size-4" />} label="Gender" value={genderLabel(row.holderGender)} />
              <DetailField icon={<Users className="size-4" />} label="Relation" value={displayVal(row.holderRelationship)} />
              <DetailField icon={<FileText className="size-4" />} label="PAN" value={displayVal(row.insuredParty.pan)} />
            </div>
          </CardContent>
        </Card>

        <Card className={profileTheme.card}>
          <CardHeader className="pb-3">
            <CardTitle className={cn("flex items-center gap-2 text-base", profileTheme.cardTitle)}>
              <Shield className={cn("size-4", profileTheme.icon)} />
              SVKK Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField icon={<Shield className="size-4" />} label="SVKK ID" value={displayVal(row.insuredParty.svkkPublicId)} />
              <DetailField icon={<FileText className="size-4" />} label="Reference No" value={displayVal(row.referenceNo)} />
              <DetailField icon={<Award className="size-4" />} label="Category" value={displayVal(categoryLabel)} />
              <DetailField icon={<Calendar className="size-4" />} label="Month" value={displayVal(row.periodMonthText)} />
              <DetailField icon={<Calendar className="size-4" />} label="Year" value={displayVal(activeYearLabel || row.periodYearText)} />
              <DetailField icon={<Building2 className="size-4" />} label="Village" value={displayVal(row.village)} />
              <DetailField icon={<Users className="size-4" />} label="Group" value={displayVal(row.policyGroup ?? row.policyGrouping)} />
              <DetailField icon={<Building2 className="size-4" />} label="Area" value={displayVal(row.area)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={profileTheme.card}>
        <CardContent className="p-4 sm:p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="border-b border-[#E5E7EB]">
              <TabsList className="mb-0 h-auto w-full flex-wrap justify-start gap-0 bg-transparent p-0">
                {[
                  ["policy", "Policy Details"],
                  ["members", "Members"],
                  ["premium", "Premium"],
                  ["payment", "Payment"],
                  ["loan", "Loan / CD / Refund"],
                  ["documents", "Documents"],
                  ["claims", "Claims"],
                ].map(([id, label]) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className={cn(
                      "rounded-none border-b-2 border-transparent px-4 pb-3 pt-1 shadow-none data-[state=active]:shadow-none",
                      profileTheme.tabInactive,
                      "data-[state=active]:border-[#2563EB] data-[state=active]:bg-transparent data-[state=active]:text-[#2563EB] data-[state=active]:font-semibold",
                    )}
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="policy" className="mt-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <DetailField icon={<Building2 className="size-5" />} label="Insurance Company" value={displayVal(row.insuranceCompany)} />
                <DetailField icon={<Handshake className="size-5" />} label="TPA" value={displayVal(row.tpa)} />
                <DetailField icon={<FileText className="size-5" />} label="Previous Policy No" value={displayVal(row.previousPolicyNo)} />
                <DetailField icon={<Calendar className="size-5" />} label="Previous End Date (Age Anchor)" value={fmtDate(row.previousEndDate)} />
                <DetailField
                  icon={<Award className="size-5" />}
                  label="Cumulative Bonus"
                  value={fmt(y?.holderCumulativeBonus)}
                  valueClassName={profileTheme.moneyValue}
                  monetary
                />
                <DetailField icon={<Calendar className="size-5" />} label="Joining Date" value={displayVal(holderJoiningDisplay)} />
                <DetailField icon={<IndianRupee className="size-5" />} label="Add-ons (Amount rs)" value={fmt(row.holderAddOns)} monetary />
                <DetailField icon={<IndianRupee className="size-5" />} label="Basic Premium" value={fmt(y?.holderBasicPremium)} monetary />
              </div>
              <ProfileSection title="Contact Details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailField icon={<Building2 className="size-4" />} label="Address Line 1: House/Flat No, Building Name" value={displayVal(row.addressLine1)} />
                  <DetailField icon={<Building2 className="size-4" />} label="Address Line 2: Street/Road Name" value={displayVal(row.addressLine2)} />
                  <DetailField icon={<Building2 className="size-4" />} label="Address Line 3: Landmark / Locality" value={displayVal(row.addressLine3)} />
                  <DetailField icon={<Building2 className="size-4" />} label="Address Line 4: Additional Details (optional)" value={displayVal(row.addressLine4)} />
                  <DetailField icon={<Building2 className="size-4" />} label="Area" value={displayVal(row.area)} />
                  <DetailField icon={<Building2 className="size-4" />} label="City" value={displayVal(row.city)} />
                  <DetailField icon={<Building2 className="size-4" />} label="PIN Code" value={displayVal(row.pincode)} />
                  <DetailField icon={<User className="size-4" />} label="Primary Mobile Number" value={displayVal(row.insuredParty.mobile)} />
                  <DetailField icon={<User className="size-4" />} label="Secondary Mobile Number" value={displayVal(row.mobileSecondary)} />
                  <DetailField icon={<User className="size-4" />} label="WhatsApp Number" value={displayVal(row.whatsappNo)} />
                  <DetailField icon={<User className="size-4" />} label="Email ID" value={displayVal(row.insuredParty.email)} />
                </div>
              </ProfileSection>
              <ProfileSection title="Nominee Details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailField icon={<User className="size-4" />} label="Nominee Name" value={displayVal(row.nomineeName)} />
                  <DetailField icon={<User className="size-4" />} label="Nominee Relation" value={displayVal(row.nomineeRelation)} />
                  <DetailField icon={<User className="size-4" />} label="Nominee Phone number ( one number )" value={displayVal(row.contactPhone)} />
                </div>
              </ProfileSection>
              <ProfileSection title="Courier Details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailField icon={<FileText className="size-4" />} label="Courier Status (YES/NO)" value={yesNoLabel(row.courierStatus)} />
                  <DetailField icon={<Calendar className="size-4" />} label="Courier Date" value={fmtDob(row.courierDate)} />
                  <DetailField icon={<FileText className="size-4" />} label="Courier Company" value={displayVal(row.courierCompany)} />
                  <DetailField icon={<FileText className="size-4" />} label="POD Number" value={displayVal(row.podNumber)} />
                  <DetailField icon={<Building2 className="size-4" />} label="Courier Address" value={displayVal(row.courierAddress)} />
                </div>
              </ProfileSection>
              <ProfileSection title="Remarks">
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailField icon={<FileText className="size-4" />} label="General Remark" value={displayVal(generalRemark)} />
                  <DetailField icon={<FileText className="size-4" />} label="Policy Change Remark" value={displayVal(policyChangeRemark)} />
                  <DetailField icon={<FileText className="size-4" />} label="Category Change Remark" value={displayVal(categoryChangeRemark)} />
                </div>
              </ProfileSection>
            </TabsContent>

            <TabsContent value="members" className="mt-6">
              <div className={cn("overflow-x-auto rounded-xl border border-[#E5E7EB]", profileTheme.card)}>
                <table className="w-full min-w-[960px] text-sm">
                  <thead className={profileTheme.tableHead}>
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
                        <th key={h} className="text-muted-foreground px-3 py-2 text-left text-xs font-semibold uppercase">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(y?.members ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-muted-foreground px-3 py-6 text-center">
                          {displayVal(null)}
                        </td>
                      </tr>
                    ) : (
                      (y?.members ?? []).map((m, idx) => (
                        <tr
                          key={`${m.name}-${m.dob}`}
                          className={cn("border-t border-[#E5E7EB]", idx % 2 === 1 && "bg-[#F9FAFB]")}
                        >
                          <td className="px-3 py-2">{displayVal(m.name)}</td>
                          <td className="px-3 py-2">{displayVal(m.relationship)}</td>
                          <td className="px-3 py-2">{fmtDate(m.dob)}</td>
                          <td className="px-3 py-2">{displayVal(m.ageAtEntry)}</td>
                          <td className="px-3 py-2">{genderLabel(m.gender)}</td>
                          <td className="px-3 py-2">{fmtDate(m.dateOfJoining)}</td>
                          <td className="px-3 py-2">{fmt(m.sumInsured)}</td>
                          <td className="px-3 py-2">{fmt(m.cumulativeBonus)}</td>
                          <td className="px-3 py-2">{displayVal(m.memberPhone)}</td>
                          <td className="px-3 py-2">{fmt(m.addOnsAmount)}</td>
                          <td className="px-3 py-2">{fmt(m.basicPremium)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="premium" className="mt-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <DetailField icon={<IndianRupee className="size-4" />} label="Gross Premium" value={fmt(y?.grossPremium)} monetary />
                <DetailField icon={<IndianRupee className="size-4" />} label="Taxes - %" value={fmt(y?.taxPercent)} monetary />
                <DetailField icon={<IndianRupee className="size-4" />} label="TAXES AMOUNT" value={fmt(y?.taxAmount)} monetary />
                <DetailField icon={<IndianRupee className="size-4" />} label="SVKK Premium" value={fmt(y?.svkkPremium ?? y?.vkkPremium)} monetary />
                <DetailField icon={<IndianRupee className="size-4" />} label="Net Premium" value={fmt(y?.expectedNetPremium ?? y?.netPremium)} monetary />
                {allowCommission ? (
                  <>
                    <DetailField icon={<IndianRupee className="size-4" />} label="Commission" value={fmt(y?.commissionAmount)} monetary />
                    <DetailField icon={<IndianRupee className="size-4" />} label="VKK Commission" value={fmt(y?.vkkCommission)} monetary />
                  </>
                ) : null}
                <DetailField icon={<IndianRupee className="size-4" />} label="Policy Holder Premium" value={fmt(y?.yearPolicyHolderPremium)} monetary />
                <DetailField
                  icon={<IndianRupee className="size-4" />}
                  label="Premium (1 Lakh Individual / 2 Lakh Floater)"
                  value={fmt(y?.twoLacFloater ?? y?.premiumOneOrTwoLakh)}
                  monetary
                />
                <DetailField
                  icon={<IndianRupee className="size-4" />}
                  label="Contribution (Gaam Mahajan / VKK)"
                  value={fmt(y?.gaamMahajanContribution ?? y?.gaamMahajanVkk)}
                  monetary
                />
                <DetailField icon={<IndianRupee className="size-4" />} label="Excess / Short Amount" value={fmt(y?.excessShortAmount)} monetary />
                <DetailField
                  icon={<IndianRupee className="size-4" />}
                  label="Difference Amount Paid by Policyholder"
                  value={fmt(y?.differenceAmountPaidByHolder ?? y?.diffPaidByHolder)}
                  monetary
                />
              </div>
            </TabsContent>

            <TabsContent value="loan" className="mt-6">
              <div className="space-y-6">
                <div>
                  <SubsectionLabel>Loan</SubsectionLabel>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailField icon={<FileText className="size-4" />} label="Loan Taken (Yes/No)" value={yesNoLabel(row.loanStatus)} />
                    <DetailField icon={<IndianRupee className="size-4" />} label="Loan Amount" value={fmt(row.loanAmount)} monetary />
                  </div>
                </div>
                <div className="border-t border-[#E5E7EB] pt-6">
                  <SubsectionLabel>CD</SubsectionLabel>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailField icon={<FileText className="size-4" />} label="CD Account Used" value={yesNoLabel(row.cdAccountUsed)} />
                    <DetailField icon={<IndianRupee className="size-4" />} label="CD Amount" value={fmt(row.cdAmount)} monetary />
                  </div>
                </div>
                <div className="border-t border-[#E5E7EB] pt-6">
                  <SubsectionLabel>Refund</SubsectionLabel>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailField icon={<IndianRupee className="size-4" />} label="Refund Cheque Amount" value={fmt(row.refundChequeAmount)} monetary />
                    <DetailField icon={<FileText className="size-4" />} label="Refund Cheque Number" value={displayVal(row.refundChequeNo)} />
                    <DetailField icon={<Calendar className="size-4" />} label="Refund Cheque Date" value={displayVal(refundDateDisplay)} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="payment" className="mt-6">
              {paymentDisplays.length === 0 ? (
                <p className={cn("text-sm", profileTheme.subtext)}>{displayVal(null)}</p>
              ) : (
                <div className="space-y-4">
                  {paymentDisplays.map((payment) => (
                    <Card key={payment.index} className={profileTheme.card}>
                      <CardHeader className="border-b border-[#E5E7EB] bg-[#F9FAFB] pb-2">
                        <CardTitle className={cn("text-sm font-semibold", profileTheme.cardTitle)}>
                          Transaction {payment.index}
                          {payment.modeLabel ? ` · ${payment.modeLabel}` : ""}
                          {paymentAmountLabel(payment.amount)}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          {payment.fields.map((field) => (
                            <DetailField
                              key={field.label}
                              icon={<IndianRupee className="size-4" />}
                              label={field.label}
                              value={
                                field.label.toLowerCase().includes("date")
                                  ? displayVal(formatDateIso(field.value) || field.value)
                                  : displayVal(field.value)
                              }
                              monetary={!field.label.toLowerCase().includes("date")}
                            />
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="documents" className="mt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField icon={<FileText className="size-4" />} label="Aadhaar" value={displayVal(row.insuredParty.aadhaarNo)} />
                <DetailField icon={<FileText className="size-4" />} label="PAN" value={displayVal(row.insuredParty.pan)} />
                <DetailField icon={<FileText className="size-4" />} label="Policy URL" value={<PolicyUrlLinks policyUrl={row.policyUrl} />} />
                <DetailField
                  icon={<FileText className="size-4" />}
                  label="URL"
                  value={
                    row.policyUrl2?.trim() ? (
                      <a
                        href={row.policyUrl2}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#2563EB] break-all text-sm underline"
                      >
                        {row.policyUrl2}
                      </a>
                    ) : (
                      displayVal(null)
                    )
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="claims" className="mt-6">
              <PolicyProfileClaimsTab
                policyId={currentPolicyId}
                svkkPublicId={row.insuredParty?.svkkPublicId}
                subtextClassName={profileTheme.subtext}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
