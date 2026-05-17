"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adProductFormValueFromApi } from "@/features/svkk-policies/ad-product-variant";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import {
  canDeletePolicy,
  canUpdatePolicy,
} from "@/lib/svkk/permissions";
import { parsePolicyUrls } from "@/features/svkk-policies/ad-policy-detail-to-form";
import { resolvePolicyPaymentDisplays } from "@/features/svkk-policies/policy-bank-display";
import {
  fetchPolicyYearSiblings,
  singleRowYearSibling,
  type PolicyListYearSibling,
} from "@/features/svkk-policies/policy-year-siblings";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PolicyYear = {
  id: string;
  yearLabel: string;
  sumInsured: unknown;
  vkkPremium: unknown;
  expectedNetPremium?: unknown;
  grossPremium?: unknown;
  commissionAmount?: unknown;
  twoLacFloater?: unknown;
  yearPolicyHolderPremium?: unknown;
  gaamMahajanVkk?: unknown;
  excessShortAmount?: unknown;
  diffPaidByHolder?: unknown;
  holderBasicPremium?: unknown;
  policyStart: string | null;
  policyEnd: string | null;
  bankName: string | null;
  bankAccountLast4?: string | null;
  utrRef?: string | null;
  holderCumulativeBonus: unknown;
  holderJoiningYear: string | null;
  members: Array<{
    name: string;
    relationship: string;
    dob: string;
    sumInsured?: unknown;
    cumulativeBonus?: unknown;
    dateOfJoining?: string | null;
    memberPhone?: string | null;
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

type PolicyDetail = {
  id: string;
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
  holderAge?: number | null;
  loanStatus?: string | null;
  loanAmount?: unknown;
  refundChequeAmount?: unknown;
  refundChequeNo?: string | null;
  refundChequeDate?: string | null;
  cdAccountUsed?: boolean | null;
  cdAmount?: unknown;
  courierStatus?: string | null;
  courierDate?: string | null;
  courierAddress?: string | null;
  updatedAt: string;
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
  years: PolicyYear[];
};

const thClass =
  "border border-border bg-muted px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-foreground";
const tdClass = "border border-border px-2 py-2 align-top text-sm";

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

function holderAge(row: PolicyDetail): string {
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

function cdUsedLabel(v: boolean | null | undefined): string {
  if (v === true) return "YES";
  if (v === false) return "NO";
  return "";
}

function formatInrRupee(v: unknown): string | null {
  const formatted = formatNumIn(v);
  if (!formatted) return null;
  return `₹ ${formatted}`;
}

async function loadPolicyById(policyId: string): Promise<PolicyDetail> {
  return svkkJson<PolicyDetail>(`/policies/${policyId}`);
}

export default function SvkkPolicyDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useSvkkAuth();
  const id = String(params.id);
  const selectedYearLabel = searchParams.get("year")?.trim() ?? "";

  const [row, setRow] = useState<PolicyDetail | null>(null);
  const [yearTabs, setYearTabs] = useState<PolicyListYearSibling[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [yearId, setYearId] = useState<string | "">("");
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [switchingYear, setSwitchingYear] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const missingUrl = !getSvkkApiBase();

  const perms = user?.permissions ?? [];
  const canDel = canDeletePolicy(perms);
  const canEdit = canUpdatePolicy(perms);

  const applyYearToDetail = useCallback((detail: PolicyDetail, yearLabel: string) => {
    const matched =
      detail.years.find((yy) => yy.yearLabel === yearLabel) ??
      (detail.periodYearText?.trim() === yearLabel ? detail.years[0] : undefined);
    setYearId(matched?.id ?? detail.years[0]?.id ?? "");
  }, []);

  useEffect(() => {
    if (missingUrl) return;
    let cancelled = false;
    void (async () => {
      if (!row) setLoadingDetail(true);
      else setSwitchingYear(true);
      setErr(null);
      try {
        const initial = await loadPolicyById(id);
        if (cancelled) return;

        const svkkId = initial.insuredParty.svkkPublicId.trim();
        let tabs: PolicyListYearSibling[] = [];
        if (svkkId) {
          tabs = await fetchPolicyYearSiblings(svkkId);
        }
        if (tabs.length === 0) {
          tabs = singleRowYearSibling({
            id: initial.id,
            policyNo: initial.policyNo,
            referenceNo: initial.referenceNo,
            periodYearText: initial.periodYearText,
            insuredParty: initial.insuredParty,
            years: initial.years.map((yy) => ({
              yearLabel: yy.yearLabel,
              vkkPremium: yy.vkkPremium,
              sumInsured: yy.sumInsured,
            })),
          });
        }
        if (cancelled) return;
        setYearTabs(tabs);

        const targetTab =
          (selectedYearLabel ? tabs.find((t) => t.yearLabel === selectedYearLabel) : undefined) ??
          tabs[0];
        if (!targetTab) {
          setRow(initial);
          applyYearToDetail(initial, initial.periodYearText ?? initial.years[0]?.yearLabel ?? "");
          return;
        }

        const detail =
          targetTab.policyId === initial.id ? initial : await loadPolicyById(targetTab.policyId);
        if (cancelled) return;

        setRow(detail);
        applyYearToDetail(detail, targetTab.yearLabel);

        const urlYear = selectedYearLabel || targetTab.yearLabel;
        if (targetTab.policyId !== id || urlYear !== selectedYearLabel) {
          router.replace(
            `/policies/${targetTab.policyId}?year=${encodeURIComponent(urlYear)}`,
            { scroll: false },
          );
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Not found");
          setRow(null);
          setYearTabs([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
          setSwitchingYear(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, selectedYearLabel, missingUrl, router, applyYearToDetail]);

  const selectYear = useCallback(
    (tab: PolicyListYearSibling) => {
      router.replace(`/policies/${tab.policyId}?year=${encodeURIComponent(tab.yearLabel)}`, {
        scroll: false,
      });
    },
    [router],
  );

  async function deletePolicy() {
    setDeleteBusy(true);
    try {
      await backendApi.delete(`/policies/${id}`);
      toast.success("Policy deleted");
      setConfirmDeleteOpen(false);
      router.replace("/policies");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }
  if (err) {
    return <p className="text-destructive text-sm">{err}</p>;
  }
  if (loadingDetail || !row) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  const activeYearLabel =
    selectedYearLabel || row.periodYearText?.trim() || row.years[0]?.yearLabel || "";
  const y =
    row.years.find((item) => item.id === yearId) ??
    row.years.find((item) => item.yearLabel === activeYearLabel) ??
    row.years[0];
  const paymentDisplays = resolvePolicyPaymentDisplays(y, formatNumIn);
  const policyTypeLabel = row.adProductVariant
    ? adProductFormValueFromApi(row.adProductVariant) || row.policyType.name
    : row.policyType.name;
  const refundDateRaw = row.refundChequeDate ? formatDateIso(row.refundChequeDate) : "";
  const refundDateDisplay =
    refundDateRaw === "0000-01-01" || refundDateRaw.startsWith("0000-00") ? "0000-00-00" : refundDateRaw;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">View policy</h1>
        {canEdit ? (
          <Button asChild variant="default" size="sm" className="gap-1.5">
            <Link
              href={`/policies/${id}/edit?year=${encodeURIComponent(activeYearLabel)}`}
            >
              <Pencil className="size-3.5" />
              Edit policy
            </Link>
          </Button>
        ) : null}
      </div>

      {yearTabs.length > 0 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm font-medium">Select year</p>
          <div className="flex max-w-md flex-col gap-2">
            {yearTabs.map((tab) => {
              const active = tab.yearLabel === activeYearLabel;
              const premium = formatInrRupee(tab.vkkPremium);
              return (
                <Button
                  key={`${tab.policyId}-${tab.yearLabel}`}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-auto w-full flex-col items-stretch gap-1 px-4 py-3 text-left",
                    active && "ring-primary/30 ring-2",
                  )}
                  onClick={() => selectYear(tab)}
                >
                  <span className="text-base font-bold tabular-nums">{tab.yearLabel}</span>
                  <span
                    className={cn(
                      "text-xs font-normal",
                      active ? "text-primary-foreground/90" : "text-muted-foreground",
                    )}
                  >
                    {[tab.referenceNo, premium].filter(Boolean).join(" · ") || "Open year record"}
                  </span>
                </Button>
              );
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            Each year is a separate policy record for this SVKK ID. Choosing a year loads that
            year&apos;s policy number, reference, premium, and members below.
          </p>
        </div>
      ) : null}

      <Card className={cn("overflow-hidden", switchingYear && "pointer-events-none opacity-60")}>
        <CardContent className="p-4 sm:p-6">
          <h4 className="mt-2 mb-3 text-base font-semibold tracking-wide">POLICY DETAILS</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <tbody>
                <tr>
                  <th className={thClass}>Policy number</th>
                  <th className={thClass}>Policy type</th>
                  <th className={thClass}>Customer ID</th>
                  <th className={thClass}>Category</th>
                  <th className={thClass}>SVKK ID</th>
                </tr>
                <tr>
                  <td className={tdClass}>{row.policyNo ?? ""}</td>
                  <td className={tdClass}>{policyTypeLabel}</td>
                  <td className={tdClass}>{row.insuredParty.customerId ?? ""}</td>
                  <td className={tdClass}>{row.category?.key ?? ""}</td>
                  <td className={tdClass}>{row.insuredParty.svkkPublicId}</td>
                </tr>
                <tr>
                  <th className={thClass}>Insurance company</th>
                  <th className={thClass}>TPA</th>
                  <th className={thClass}>Policy start date</th>
                  <th className={thClass}>Policy expiry date</th>
                  <th className={thClass}>No. of person insured</th>
                </tr>
                <tr>
                  <td className={tdClass}>{row.insuranceCompany ?? ""}</td>
                  <td className={tdClass}>{row.tpa ?? ""}</td>
                  <td className={tdClass}>{y?.policyStart ? formatDateIso(y.policyStart) : ""}</td>
                  <td className={tdClass}>{y?.policyEnd ? formatDateIso(y.policyEnd) : ""}</td>
                  <td className={tdClass}>
                    {row.personsInsuredCount != null ? String(row.personsInsuredCount) : ""}
                  </td>
                </tr>
                <tr>
                  <th className={thClass}>Sum insured</th>
                  <th className={thClass}>Cumulative bonus</th>
                  <th className={thClass}>Joining year</th>
                  <th className={thClass}>Year</th>
                  <th className={thClass}>Month</th>
                </tr>
                <tr>
                  <td className={tdClass}>{y ? formatNumIn(y.sumInsured) : ""}</td>
                  <td className={tdClass}>{y ? formatNumIn(y.holderCumulativeBonus) : ""}</td>
                  <td className={tdClass}>{y?.holderJoiningYear ?? ""}</td>
                  <td className={tdClass}>{activeYearLabel || row.periodYearText || ""}</td>
                  <td className={tdClass}>{row.periodMonthText ?? ""}</td>
                </tr>
                <tr>
                  <th className={thClass}>Policy grouping</th>
                  <th className={thClass} colSpan={4}>
                    Policy URL
                  </th>
                </tr>
                <tr>
                  <td className={tdClass}>{row.policyGrouping ?? ""}</td>
                  <td className={tdClass} colSpan={4}>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      {parsePolicyUrls(row.policyUrl).map((u, i) => (
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
                  </td>
                </tr>
                <tr>
                  <th className={thClass}>URL</th>
                  <td className={tdClass} colSpan={4}>
                    <span className="min-w-0 break-all">
                      {row.policyUrl2 ? (
                        <a
                          href={row.policyUrl2}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline"
                        >
                          {row.policyUrl2}
                        </a>
                      ) : (
                        ""
                      )}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 className="mt-8 mb-3 text-base font-semibold tracking-wide">PERSONAL INFORMATION</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <tbody>
                <tr>
                  <th className={thClass}>Policy holder name</th>
                  <th className={thClass}>PAN card no</th>
                  <th className={thClass}>Aadhaar No.</th>
                  <th className={thClass}>Village</th>
                  <th className={thClass}>Date of birth</th>
                </tr>
                <tr>
                  <td className={tdClass}>{row.insuredParty.name}</td>
                  <td className={tdClass}>{row.insuredParty.pan ?? ""}</td>
                  <td className={tdClass}>{row.insuredParty.aadhaarNo ?? ""}</td>
                  <td className={tdClass}>{row.village ?? ""}</td>
                  <td className={tdClass}>
                    {row.insuredParty.dateOfBirth ? formatDateDmy(row.insuredParty.dateOfBirth) : ""}
                  </td>
                </tr>
                <tr>
                  <th className={thClass}>Age</th>
                  <th className={thClass}>Relationship</th>
                  <th className={thClass}>Nominee&apos;s name</th>
                  <th className={thClass}>Nominee&apos;s relation</th>
                  <th className={thClass}>Address</th>
                </tr>
                <tr>
                  <td className={tdClass}>{holderAge(row)}</td>
                  <td className={tdClass}>{row.holderRelationship ?? ""}</td>
                  <td className={tdClass}>{row.nomineeName ?? ""}</td>
                  <td className={tdClass}>{row.nomineeRelation ?? ""}</td>
                  <td className={tdClass}>{row.addressLine1 ?? ""}{row.addressLine2 ? `, ${row.addressLine2}` : ""}</td>
                </tr>
                <tr>
                  <th className={thClass}>Address (cont.)</th>
                  <th className={thClass}>Area</th>
                  <th className={thClass}>City</th>
                  <th className={thClass}>PIN code</th>
                  <th className={thClass}>WhatsApp No.</th>
                </tr>
                <tr>
                  <td className={tdClass}>{row.addressLine3 ?? ""}{row.addressLine4 ? `, ${row.addressLine4}` : ""}</td>
                  <td className={tdClass}>{row.area ?? ""}</td>
                  <td className={tdClass}>{row.city ?? ""}</td>
                  <td className={tdClass}>{row.pincode ?? ""}</td>
                  <td className={tdClass}>{row.whatsappNo ?? ""}</td>
                </tr>
                <tr>
                  <th className={thClass}>Primary mobile no</th>
                  <th className={thClass}>Secondary mobile no</th>
                  <th className={thClass} colSpan={3}>
                    Email ID
                  </th>
                </tr>
                <tr>
                  <td className={tdClass}>{row.insuredParty.mobile}</td>
                  <td className={tdClass}>{row.mobileSecondary ?? row.contactPhone ?? ""}</td>
                  <td className={tdClass} colSpan={3}>{row.insuredParty.email ?? ""}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 className="mt-8 mb-3 text-base font-semibold tracking-wide">
            Payment &amp; bank details
          </h4>
          {paymentDisplays.length === 0 ? (
            <p className="text-muted-foreground text-sm">No payment records for this year.</p>
          ) : (
            <div className="space-y-6">
              {paymentDisplays.map((payment) => (
                <div key={payment.index} className="overflow-x-auto rounded-md border border-border p-3">
                  <p className="mb-2 text-sm font-semibold">
                    Payment {payment.index}
                    <span className="text-muted-foreground font-normal"> · {payment.modeLabel}</span>
                    {payment.amount ? (
                      <span className="text-muted-foreground font-normal"> · ₹ {payment.amount}</span>
                    ) : null}
                  </p>
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <tbody>
                      {Array.from({ length: Math.ceil(payment.fields.length / 2) }).map((_, rowIdx) => {
                        const left = payment.fields[rowIdx * 2];
                        const right = payment.fields[rowIdx * 2 + 1];
                        return (
                          <tr key={`${payment.index}-${rowIdx}`}>
                            <th className={thClass}>{left?.label ?? ""}</th>
                            <td className={tdClass}>
                              {left?.label.toLowerCase().includes("date")
                                ? formatDateIso(left.value) || left.value
                                : (left?.value ?? "")}
                            </td>
                            <th className={thClass}>{right?.label ?? ""}</th>
                            <td className={tdClass}>
                              {right
                                ? right.label.toLowerCase().includes("date")
                                  ? formatDateIso(right.value) || right.value
                                  : right.value
                                : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          <h4 className="mt-8 mb-3 text-base font-semibold tracking-wide">VKK details</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <tbody>
                <tr>
                  <th className={thClass}>Policy holder premium</th>
                  <th className={thClass}>Gaam Mahajan / VKK contribution</th>
                  <th className={thClass}>Excess / short amount</th>
                  <th className={thClass}>Diff. amount paid by policyholder</th>
                  <th className={thClass}>Loan taken</th>
                </tr>
                <tr>
                  <td className={tdClass}>{y ? formatNumIn(y.yearPolicyHolderPremium) : ""}</td>
                  <td className={tdClass}>{y ? formatNumIn(y.gaamMahajanVkk) : ""}</td>
                  <td className={tdClass}>{y ? formatNumIn(y.excessShortAmount) : ""}</td>
                  <td className={tdClass}>{y ? formatNumIn(y.diffPaidByHolder) : ""}</td>
                  <td className={tdClass}>{row.loanStatus ?? ""}</td>
                </tr>
                <tr>
                  <th className={thClass}>Loan amount</th>
                  <th className={thClass}>Refund cheque amount</th>
                  <th className={thClass}>Refund cheque no.</th>
                  <th className={thClass}>Refund cheque date</th>
                  <th className={thClass}>CD account used</th>
                </tr>
                <tr>
                  <td className={tdClass}>{formatNumIn(row.loanAmount)}</td>
                  <td className={tdClass}>{formatNumIn(row.refundChequeAmount)}</td>
                  <td className={tdClass}>{row.refundChequeNo ?? ""}</td>
                  <td className={tdClass}>{refundDateDisplay}</td>
                  <td className={tdClass}>{cdUsedLabel(row.cdAccountUsed)}</td>
                </tr>
                <tr>
                  <th className={thClass}>CD amount</th>
                  <th className={thClass}>Courier status</th>
                  <th className={thClass}>Courier date</th>
                  <th className={thClass}>Address for courier</th>
                  <th className={thClass}>Remark</th>
                </tr>
                <tr>
                  <td className={tdClass}>{formatNumIn(row.cdAmount)}</td>
                  <td className={tdClass}>{row.courierStatus ?? ""}</td>
                  <td className={tdClass}>
                    {row.courierDate ? formatDateIso(row.courierDate) : ""}
                  </td>
                  <td className={tdClass}>{row.courierAddress ?? ""}</td>
                  <td className={tdClass}>{row.remarks ?? ""}</td>
                </tr>
                <tr>
                  <th className={thClass}>Reference no</th>
                  <th className={thClass}>SVKK premium</th>
                  <th className={thClass} colSpan={3}>
                    Net premium
                  </th>
                </tr>
                <tr>
                  <td className={tdClass}>{row.referenceNo ?? ""}</td>
                  <td className={tdClass}>{y ? formatNumIn(y.vkkPremium) : ""}</td>
                  <td className={tdClass} colSpan={3}>
                    {y ? formatNumIn(y.expectedNetPremium) : ""}
                  </td>
                </tr>
                <tr>
                  <th className={thClass}>Gross premium</th>
                  <th className={thClass}>Commission</th>
                  <th className={thClass} colSpan={3}>
                    Premium 1 Lac ind / 2 Lac floater
                  </th>
                </tr>
                <tr>
                  <td className={tdClass}>{y ? formatNumIn(y.grossPremium) : ""}</td>
                  <td className={tdClass}>{y ? formatNumIn(y.commissionAmount) : ""}</td>
                  <td className={tdClass} colSpan={3}>
                    {y ? formatNumIn(y.twoLacFloater) : ""}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h5 className="mt-8 mb-3 text-sm font-semibold tracking-wide">Members</h5>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={thClass}>Member name</th>
                  <th className={thClass}>Relationship</th>
                  <th className={thClass}>Date of birth</th>
                  <th className={thClass}>Age</th>
                  <th className={thClass}>Date of joining</th>
                  <th className={thClass}>Sum insured</th>
                  <th className={thClass}>Cumulative bonus</th>
                  <th className={thClass}>Phone no</th>
                  <th className={thClass}>Basic premium</th>
                </tr>
              </thead>
              <tbody>
                {(y?.members ?? []).map((m) => (
                  <tr key={`${m.name}-${m.dob}`}>
                    <td className={tdClass}>{m.name}</td>
                    <td className={tdClass}>{m.relationship}</td>
                    <td className={tdClass}>{formatDateIso(m.dob)}</td>
                    <td className={tdClass}>
                      {m.ageAtEntry != null ? String(m.ageAtEntry) : ""}
                    </td>
                    <td className={tdClass}>
                      {m.dateOfJoining ? formatDateIso(m.dateOfJoining) : ""}
                    </td>
                    <td className={tdClass}>{formatNumIn(m.sumInsured)}</td>
                    <td className={tdClass}>{formatNumIn(m.cumulativeBonus)}</td>
                    <td className={tdClass}>{m.memberPhone ?? ""}</td>
                    <td className={tdClass}>{formatNumIn(m.basicPremium)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </CardContent>
      </Card>

      {canDel ? (
        <>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={deleteBusy}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            Delete policy
          </Button>
          <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this policy?</DialogTitle>
                <DialogDescription>
                  This cannot be undone. Only administrators can delete policies.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmDeleteOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteBusy}
                  onClick={() => void deletePolicy()}
                >
                  {deleteBusy ? "Deleting…" : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
