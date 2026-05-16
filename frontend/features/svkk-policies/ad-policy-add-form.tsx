"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DropdownCombobox } from "@/components/svkk/dropdown-combobox";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { POLICY_PERIOD_MONTH_LABELS_CALENDAR_ORDER } from "@/lib/svkk/policy-period-months";
import {
  fetchPremiumSnapshot,
  normPolicyKey,
  quoteFromInput,
  rs,
  type MemberInput,
  type PremiumState,
} from "@/lib/svkk/premium";
import { svkkJson } from "@/lib/svkk/api";
import { useDropdownOptions } from "@/lib/svkk/use-dropdown-options";
import { canUploadPolicyDrive } from "@/lib/svkk/permissions";
import { buildReceiptDocumentHtml, type PolicyDetailForReceipt } from "@/lib/svkk/policy-receipt-print";
import {
  buildReceiptFilename,
  downloadReceiptPreviewAsPdf,
  printReceiptPreview,
} from "@/lib/svkk/receipt-pdf";
import { useReceiptSettings } from "@/lib/svkk/use-receipt-settings";
import { ExternalLink, FilePlus, FilePenLine, Loader2, Minus, Plus, RefreshCcw, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormik } from "formik";
import { toast } from "sonner";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { emptyMemberRow } from "./ad-member-types";
import type { AdMemberRow } from "./ad-member-types";
import { AD_PRODUCT_OPTIONS, adProductFormValueFromApi, toAdProductVariant } from "./ad-product-variant";
import { FormikError, RequiredLabel } from "./ad-policy-form-controls";
import { getAdPolicyInitialValues, type AdPolicyFormValues } from "./ad-policy-form-values";
import { adPolicyValidationSchema } from "./ad-policy-validation-schema";
import { submitAdPolicyPatchRequest, submitAdPolicyRequest } from "./ad-policy-submit";
import {
  pickPolicyYear,
  policyDetailToAdFormValues,
  type SvkkPolicyDetailForForm,
} from "./ad-policy-detail-to-form";
import { PolicyDriveUploadButton } from "./policy-drive-upload";

export type { AdMemberRow } from "./ad-member-types";

type ChartRow = { id: string; version: number; chartKind: string };
type PolicyTypeRow = { id: string; key: string; name: string };
type AddSectionId =
  | "policy_details"
  | "policy_holder_details"
  | "members_details"
  | "address_contacts"
  | "premium_details"
  | "payment_bank_details"
  | "nominee_details"
  | "loan_details"
  | "courier"
  | "remark";
type PolicyListRow = {
  id: string;
  insuredParty: { svkkPublicId: string; name: string; customerId: string | null };
  adProductVariant?: string | null;
  periodYearText?: string | null;
  years: Array<{ yearLabel: string }>;
};
type FetchSuggestion = {
  id: string;
  svkkPublicId: string;
  holderName: string;
  customerId: string | null;
};

const ADD_SECTIONS: ReadonlyArray<{ id: AddSectionId; label: string; ref: string }> = [
  { id: "policy_details", label: "Policy Details", ref: "section-policy-details" },
  { id: "policy_holder_details", label: "Policy Holder Details", ref: "section-policy-holder-details" },
  { id: "members_details", label: "Members Details", ref: "section-members-details" },
  { id: "address_contacts", label: "Contact Details", ref: "section-address-contacts" },
  { id: "premium_details", label: "Premium Details", ref: "section-premium-details" },
  { id: "payment_bank_details", label: "Payment & Bank Details", ref: "section-payment-bank-details" },
  { id: "nominee_details", label: "Nominee Details", ref: "section-nominee-details" },
  { id: "loan_details", label: "Loan / CD / Refund", ref: "section-loan-details" },
  { id: "courier", label: "Courier Details", ref: "section-courier" },
  { id: "remark", label: "Remark", ref: "section-remark" },
];

const POLICY_CATEGORY_OPTIONS = ["A", "B", "C", "D", "STAFF", "SVGA"] as const;

function ageFromDobOnAnchor(iso: string, anchorIso: string): string {
  if (!iso || !anchorIso) {
    return "";
  }
  const dob = new Date(iso);
  const anchor = new Date(anchorIso);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(anchor.getTime()) || anchor.getTime() < dob.getTime()) {
    return "";
  }
  const years = Math.floor((anchor.getTime() - dob.getTime()) / (365.2425 * 24 * 60 * 60 * 1000));
  return years >= 0 ? String(years) : "";
}

function parseInr(value: string): number {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) {
    return 0;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInr(value: number): string {
  return value.toLocaleString("en-IN");
}

function toMoneyString(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "";
  }
  return String(Math.round(value * 100) / 100);
}

function toRoundedIntegerString(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "";
  }
  return String(Math.round(value));
}

function toMoneyStringAllowZero(value: number): string {
  if (!Number.isFinite(value)) {
    return "";
  }
  if (value === 0) {
    return "0";
  }
  return String(Math.round(value * 100) / 100);
}

function normalizeGroupingToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() || "OTHER";
}

function monthToken(value: string): string {
  const raw = value.trim();
  if (!raw) return "JAN";
  const byNumber = Number(raw);
  if (Number.isFinite(byNumber) && byNumber >= 1 && byNumber <= 12) {
    const map = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return map[byNumber - 1] ?? "JAN";
  }
  return raw.slice(0, 3).toUpperCase();
}

function yearToken(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 4) {
    return digits.slice(0, 4);
  }
  return String(new Date().getFullYear());
}

function normalizeYearLabel(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const fy = raw.match(/^(\d{4})-(\d{2})$/);
  if (fy) {
    return `${fy[1]}-${fy[2]}`;
  }
  const start = Number(raw.replace(/\D/g, "").slice(0, 4));
  if (!Number.isFinite(start) || start < 1900) {
    return raw;
  }
  const end2 = String((start + 1) % 100).padStart(2, "0");
  return `${start}-${end2}`;
}

/**
 * Reference No format is `{group}{year:4-digit}{month-token}{seq:4-digit}`.
 * When carrying a policy forward to a new year, shift the year token so the
 * regenerated Reference No reflects the new policy year — even if the auto-id
 * endpoint can't compose a fresh number (e.g. Policy Grouping missing).
 * SVKK Public ID is *not* touched — it's holder-stable across years.
 */
function shiftReferenceNoYear(refNo: string, prevYearLabel: string, nextYearLabel: string): string {
  const trimmed = refNo.trim();
  if (!trimmed) return trimmed;
  const prev4 = (prevYearLabel.match(/\d{4}/) || [])[0] ?? "";
  const next4 = (nextYearLabel.match(/\d{4}/) || [])[0] ?? "";
  if (!prev4 || !next4 || prev4 === next4) return trimmed;
  if (!trimmed.includes(prev4)) return trimmed;
  // String.prototype.replace with a string replaces only the first occurrence,
  // which is the year token (precedes the trailing 4-digit seq).
  return trimmed.replace(prev4, next4);
}

function nextYearLabel(value: string): string {
  const raw = value.trim();
  const fy = raw.match(/^(\d{4})-(\d{2})$/);
  if (fy) {
    const nextStart = Number(fy[1]) + 1;
    const nextEnd2 = String((nextStart + 1) % 100).padStart(2, "0");
    return `${nextStart}-${nextEnd2}`;
  }
  const start = Number(raw.replace(/\D/g, "").slice(0, 4));
  if (!Number.isFinite(start) || start < 1900) {
    return raw;
  }
  const nextStart = start + 1;
  const nextEnd2 = String((nextStart + 1) % 100).padStart(2, "0");
  return `${nextStart}-${nextEnd2}`;
}

function composeIdsFromSeq(grouping: string, month: string, year: string, svkkSeq: string, refSeq: string) {
  const group = normalizeGroupingToken(grouping);
  const mon = monthToken(month);
  const yr = yearToken(year);
  return {
    svkkPublicId: `${group}${mon}${svkkSeq}`,
    referenceNo: `${group}${yr}${mon}${refSeq}`,
  };
}

/**
 * Field label paired with a small sparkles icon + tooltip indicating the
 * value is filled in by the system. Used for SVKK ID / Reference No on the
 * Policy Details section.
 */
function AutoFieldLabel({ children, hint }: { children: React.ReactNode; hint: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label className="m-0">{children}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex size-4 cursor-help items-center justify-center rounded-full text-[#174ea6]"
            aria-label="Auto-generated"
          >
            <Sparkles className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{hint}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Fallback option lists. The form prefers dynamic options from `useDropdownOptions()`
 * (admin-managed via /admin/dropdowns). These are used only when the API has not
 * yet returned (first render) so the UI never goes blank.
 */
const FALLBACK_GENDERS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "O", label: "Other" },
];

const FALLBACK_YES_NO = [
  { value: "YES", label: "YES" },
  { value: "NO", label: "NO" },
];

const FALLBACK_RELATIONSHIP_OPTIONS = [
  { value: "Self", label: "Self" },
  { value: "Spouse", label: "Spouse" },
  { value: "Son", label: "Son" },
  { value: "Daughter", label: "Daughter" },
  { value: "Father", label: "Father" },
  { value: "Mother", label: "Mother" },
  { value: "Brother", label: "Brother" },
  { value: "Sister", label: "Sister" },
  { value: "Grandfather", label: "Grandfather" },
  { value: "Grandmother", label: "Grandmother" },
  { value: "Father-in-law", label: "Father-in-law" },
  { value: "Mother-in-law", label: "Mother-in-law" },
  { value: "Other", label: "Other" },
];

const FALLBACK_PAYMENT_MODES = [
  { value: "ONLINE", label: "Online" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
];

const FALLBACK_TRANSACTION_STATUS = [
  { value: "CLEARED", label: "Cleared" },
  { value: "DISHONOURED", label: "Dishonoured" },
  { value: "PENDING", label: "Pending" },
];

export type AdPolicyAddFormProps = {
  /** When set, loads this policy and saves via PATCH (same fields as Add policy). */
  policyId?: string;
  /** Optional year label to patch when editing grouped policies. */
  editYearLabel?: string;
};

export function AdPolicyAddForm({ policyId, editYearLabel }: AdPolicyAddFormProps = {}) {
  const router = useRouter();
  const { user } = useSvkkAuth();
  const idPrefix = useId();
  const idemKeyRef = useRef(crypto.randomUUID());
  const formRootRef = useRef<HTMLFormElement | null>(null);
  const lastAutoIdKeyRef = useRef("");
  const svkkSeqRef = useRef("");
  const refSeqRef = useRef("");
  // Fallback group prefix derived from a carried-forward SVKK ID when the form's
  // Policy Group dropdown is empty (e.g. the prior policy never had one set).
  const seededGroupRef = useRef("");
  const missingUrl = !getSvkkApiBase();
  const isEdit = Boolean(policyId);
  const canDriveUpload = user?.permissions ? canUploadPolicyDrive(user.permissions) : false;

  const receiptImageUrls = useReceiptSettings();
  const { options: ddOptions } = useDropdownOptions();
  const genderOptions = ddOptions.GENDER.length ? ddOptions.GENDER : FALLBACK_GENDERS;
  const relationOptions = ddOptions.RELATION.length ? ddOptions.RELATION : FALLBACK_RELATIONSHIP_OPTIONS;
  const yesNoOptions = ddOptions.YES_NO.length ? ddOptions.YES_NO : FALLBACK_YES_NO;
  const paymentModeOptions = ddOptions.PAYMENT_MODE.length ? ddOptions.PAYMENT_MODE : FALLBACK_PAYMENT_MODES;
  const transactionStatusOptions = ddOptions.TRANSACTION_STATUS.length
    ? ddOptions.TRANSACTION_STATUS
    : FALLBACK_TRANSACTION_STATUS;
  const areaOptions = ddOptions.AREA;
  const villageOptions = ddOptions.VILLAGE;
  const cityOptions = ddOptions.CITY;
  const sumInsuredOptions = ddOptions.SUM_INSURED;
  const categoryOptions = ddOptions.categories.length
    ? ddOptions.categories
    : POLICY_CATEGORY_OPTIONS.map((k) => ({ value: k, label: k }));
  const policyGroupOptions = ddOptions.policyGroupings.length
    ? ddOptions.policyGroupings
    : [
        { value: "SVKK", label: "SVKK" },
        { value: "NVKK", label: "NVKK" },
        { value: "RTY", label: "RTY" },
        { value: "OTHER", label: "OTHER" },
      ];

  const [policyTypeId, setPolicyTypeId] = useState("");
  const [policyChartId, setPolicyChartId] = useState("");
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<SvkkPolicyDetailForForm | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [fetchSvkkId, setFetchSvkkId] = useState("");
  const [fetchHolderName, setFetchHolderName] = useState("");
  const [fetchRows, setFetchRows] = useState<PolicyListRow[]>([]);
  const [selectedFetchId, setSelectedFetchId] = useState("");
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [fetchNotice, setFetchNotice] = useState<string | null>(null);
  const [fetchSuggestions, setFetchSuggestions] = useState<FetchSuggestion[]>([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [suppressSuggestions, setSuppressSuggestions] = useState(false);
  const [activeSection, setActiveSection] = useState<AddSectionId>("policy_details");
  const [receiptPreviewHtml, setReceiptPreviewHtml] = useState<string | null>(null);
  // After "Save Policy + Auto Receipt", we open the receipt preview first and
  // then navigate to this URL when the user closes the modal.
  const [navigateAfterReceiptClose, setNavigateAfterReceiptClose] = useState<string | null>(null);
  const [premiumState, setPremiumStateValue] = useState<PremiumState>(() => ({ defs: {}, charts: {} }));
  const [fetchedPolicyForUpdate, setFetchedPolicyForUpdate] = useState<SvkkPolicyDetailForForm | null>(null);
  const [carryForwardBusy, setCarryForwardBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchPremiumSnapshot();
        if (!cancelled) setPremiumStateValue(next);
      } catch {
        /* leave defs/charts empty; per-row rendering will show 'No age band found' */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const initialValues = useMemo(() => {
    if (isEdit && detail) {
      return policyDetailToAdFormValues(detail, { yearLabel: editYearLabel });
    }
    return getAdPolicyInitialValues();
  }, [isEdit, detail, editYearLabel]);

  const formik = useFormik<AdPolicyFormValues>({
    initialValues,
    enableReinitialize: true,
    validationSchema: adPolicyValidationSchema,
    validateOnBlur: true,
    validateOnChange: true,
    onSubmit: async (values, helpers) => {
      setApiErr(null);
      const applyBackendFieldErrors = (fieldErrors: unknown) => {
        if (!fieldErrors || typeof fieldErrors !== "object") {
          return false;
        }

        // Backend field names don't always match the form field names.
        const keyMap: Record<string, keyof AdPolicyFormValues> = {
          excessShortAmount: "excessShort",
          diffPaidByHolder: "diffAmt",
          gaamMahajanContribution: "contribution",
          gaamMahajanVkk: "gaamMahajan",
        };

        let applied = false;
        for (const [rawKey, rawVal] of Object.entries(fieldErrors as Record<string, unknown>)) {
          const formKey = (keyMap[rawKey] ?? rawKey) as keyof AdPolicyFormValues;
          const msg =
            Array.isArray(rawVal) ? rawVal.filter((x) => typeof x === "string").join(", ") : String(rawVal ?? "");
          if (!msg) {
            continue;
          }
          helpers.setFieldError(String(formKey), msg);
          applied = true;
        }
        return applied;
      };

      const tryApplyBackendValidationErrors = (e: unknown): boolean => {
        const data = (e as { response?: { data?: unknown } } | undefined)?.response?.data;
        if (!data || typeof data !== "object") {
          return false;
        }
        const fe = (data as { fieldErrors?: unknown }).fieldErrors;
        return applyBackendFieldErrors(fe);
      };

      const editCtx =
        isEdit && policyId && detail
          ? { policyId, detail }
          : !isEdit && fetchedPolicyForUpdate
            ? { policyId: fetchedPolicyForUpdate.id, detail: fetchedPolicyForUpdate }
            : null;

      if (editCtx) {
        const y = editCtx.detail.years.find((yy) => yy.yearLabel === editYearLabel) ?? editCtx.detail.years[0];
        if (!y) {
          setApiErr("This policy has no year row to update.");
          return;
        }
        try {
          await submitAdPolicyPatchRequest({
            policyId: editCtx.policyId,
            values,
            expectedUpdatedAt: editCtx.detail.updatedAt,
            yearLabel: y.yearLabel,
          });
          void router.push(`/policies/${editCtx.policyId}`);
        } catch (e) {
          if (tryApplyBackendValidationErrors(e)) {
            setApiErr("Please fix the highlighted fields and try again.");
            return;
          }
          setApiErr(e instanceof Error ? e.message : "Update failed");
        }
        return;
      }
      if (!policyTypeId || !policyChartId) {
        setApiErr("Policy type / chart not loaded.");
        return;
      }
      try {
        const id = await submitAdPolicyRequest({
          values,
          policyTypeId,
          policyChartId,
          idemKey: idemKeyRef.current,
        });
        toast.success("Policy saved");
        // Auto Receipt: fetch the freshly saved policy and open the receipt
        // preview. The user can Print → "Save as PDF" from there. When the
        // modal closes, navigate to the policy detail page.
        try {
          const saved = await svkkJson<PolicyDetailForReceipt>(`/policies/${id}`);
          setReceiptPreviewHtml(
            buildReceiptDocumentHtml(saved, { embedded: true, ...receiptImageUrls }),
          );
          setNavigateAfterReceiptClose(`/policies/${id}`);
        } catch {
          // If fetching the receipt fails for any reason, just navigate.
          void router.push(`/policies/${id}`);
        }
      } catch (e) {
        if (tryApplyBackendValidationErrors(e)) {
          setApiErr("Please fix the highlighted fields and try again.");
          return;
        }
        setApiErr(e instanceof Error ? e.message : "Create failed");
      }
    },
  });

  const {
    values,
    errors,
    touched,
    handleSubmit,
    handleChange,
    handleBlur,
    setFieldValue,
    isSubmitting,
    submitCount,
  } = formik;
  const isBusy = isSubmitting;
  const [premiumManual, setPremiumManual] = useState<Record<string, boolean>>({});
  const [ageManual, setAgeManual] = useState<Record<string, boolean>>({});
  /** Edit or fetch-for-update: keep loaded DB values; no premium/age/member auto-sync. */
  const freezeAutoCalculations = isEdit || Boolean(fetchedPolicyForUpdate);

  const markPremiumManual = useCallback((field: string) => {
    setPremiumManual((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const markAgeManual = useCallback((field: string) => {
    setAgeManual((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const handlePremiumInput = useCallback(
    (field: keyof AdPolicyFormValues, mirrors: Array<keyof AdPolicyFormValues> = []) =>
      (e: ChangeEvent<HTMLInputElement>) => {
        markPremiumManual(field);
        handleChange(e);
        for (const mirror of mirrors) {
          markPremiumManual(String(mirror));
          void setFieldValue(mirror, e.target.value);
        }
      },
    [handleChange, markPremiumManual, setFieldValue],
  );

  const quote = useMemo(() => {
    const rawKey = normPolicyKey(values.adProduct || "");
    const policyKey = premiumState.charts[rawKey] ? rawKey : "individual";
    const sumInsured = parseInr(values.sumInsured);
    const endDate = values.previousEndDate || values.policyEnd || "";
    // Ignore placeholder/blank member rows (e.g. fetched policies with 0 members).
    const validMembers = (values.members || []).filter((m) => Boolean(m.name?.trim()) && Boolean(m.dob));
    const memberCount = 1 + validMembers.length;
    const holderMember: MemberInput = {
      name: values.policyHolder || "Policy Holder",
      dob: values.dob || "",
      relationship: (values.relation || "self").toLowerCase() || "self",
      gender:
        values.holderGender === "M" ? "male" : values.holderGender === "F" ? "female" : "",
      addOnRider: parseInr(values.holderAddOns),
    };
    const memberInputs: MemberInput[] = validMembers.map((m, i) => ({
      name: m.name.trim() || `Member ${i + 1}`,
      dob: m.dob,
      relationship: (m.relationship || "member").toLowerCase() || "member",
      gender: m.gender === "M" ? "male" : m.gender === "F" ? "female" : "",
      addOnRider: parseInr(m.addOnsAmount),
    }));
    return quoteFromInput(premiumState, {
      policyType: policyKey,
      memberCount,
      sumInsured,
      endDate,
      members: [holderMember, ...memberInputs],
    });
  }, [
    premiumState,
    values.adProduct,
    values.sumInsured,
    values.previousEndDate,
    values.policyEnd,
    values.policyHolder,
    values.dob,
    values.relation,
    values.holderGender,
    values.holderAddOns,
    values.members,
  ]);

  const summary = useMemo(
    () => ({
      basic: quote.basic,
      rider: quote.rider,
      gross: quote.gross,
      discount: quote.disc,
      net: quote.net,
    }),
    [quote],
  );

  useEffect(() => {
    if (freezeAutoCalculations) return;
    if (!quote.rows.length) return;
    const holderRow = quote.rows[0];
    if (
      holderRow &&
      !holderRow.error &&
      typeof holderRow.basic === "number" &&
      holderRow.basic > 0 &&
      !premiumManual.basicPremiumPs &&
      parseInr(values.basicPremiumPs) === 0
    ) {
      void setFieldValue("basicPremiumPs", String(holderRow.basic));
    }
    values.members.forEach((member, index) => {
      const row = quote.rows[index + 1];
      if (!row || row.error || typeof row.basic !== "number" || row.basic <= 0) return;
      const manualKey = `members[${index}].basicPremium`;
      if (premiumManual[manualKey]) return;
      if (parseInr(member.basicPremium) > 0) return;
      void setFieldValue(`members[${index}].basicPremium`, String(row.basic));
    });
  }, [freezeAutoCalculations, quote, premiumManual, setFieldValue, values.basicPremiumPs, values.members]);

  const selectedFetch = useMemo(
    () => fetchRows.find((row) => row.id === selectedFetchId) ?? null,
    [fetchRows, selectedFetchId],
  );

  const matchedYearRows = useMemo(() => {
    if (!fetchSvkkId.trim()) {
      return [];
    }
    return fetchRows
      .map((row) => ({ id: row.id, year: row.periodYearText ?? row.years[0]?.yearLabel ?? "" }))
      .filter((row) => row.year)
      .sort((a, b) => b.year.localeCompare(a.year));
  }, [fetchRows, fetchSvkkId]);

  const loadAdPolicyType = useCallback(async () => {
    const types = await svkkJson<PolicyTypeRow[]>("/calculation/reference/policy-types");
    const ad = types.find((t) => t.key === "ad_policy") ?? types.find((t) => t.key === "asha_kiran");
    if (!ad) {
      throw new Error("No AD or Asha Kiran policy type in database. Run prisma seed.");
    }
    setPolicyTypeId(ad.id);
    const charts = await svkkJson<ChartRow[]>(
      `/calculation/reference/charts?policyTypeId=${encodeURIComponent(ad.id)}`,
    );
    const h = charts.find((c) => c.chartKind === "COMBINED" || c.chartKind === "HOLDER");
    setPolicyChartId(h?.id ?? charts[0]?.id ?? "");
  }, []);

  const loadPolicyDetailIntoForm = useCallback(
    async (id: string, modeNotice: string) => {
      try {
        const row = await svkkJson<SvkkPolicyDetailForForm>(`/policies/${id}`);
        const nextValues = policyDetailToAdFormValues(row);
        // Lock auto-calc before setValues so premium fields are not overwritten mid-load.
        setFetchedPolicyForUpdate(row);
        setPremiumManual({});
        setAgeManual({});
        await formik.setValues(nextValues);
        setFetchNotice(modeNotice);
      } catch (e) {
        setFetchNotice(e instanceof Error ? e.message : "Failed to load policy details");
      }
    },
    [formik],
  );

  const loadFetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 1) {
      setFetchSuggestions([]);
      return;
    }
    setSuggestBusy(true);
    try {
      const search = new URLSearchParams({
        search: query.trim(),
        page: "1",
        pageSize: "25",
        sort: "createdAt",
        groupBySvkk: "false",
      });
      const res = await svkkJson<{ items: PolicyListRow[] }>(`/policies?${search.toString()}`);
      const dedup = new Map<string, FetchSuggestion>();
      for (const row of res.items ?? []) {
        const svkkId = row.insuredParty.svkkPublicId;
        if (!svkkId || dedup.has(svkkId)) {
          continue;
        }
        dedup.set(svkkId, {
          id: row.id,
          svkkPublicId: svkkId,
          holderName: row.insuredParty.name,
          customerId: row.insuredParty.customerId ?? null,
        });
      }
      setFetchSuggestions(Array.from(dedup.values()));
      setActiveSuggestionIndex(-1);
    } catch {
      setFetchSuggestions([]);
      setActiveSuggestionIndex(-1);
    } finally {
      setSuggestBusy(false);
    }
  }, []);

  const loadYearRowsBySvkkId = useCallback(async (svkkId: string) => {
    const query = new URLSearchParams({
      search: svkkId,
      page: "1",
      pageSize: "50",
      sort: "createdAt",
      groupBySvkk: "false",
    });
    const res = await svkkJson<{ items: PolicyListRow[] }>(`/policies?${query.toString()}`);
    const exactRows = (res.items ?? []).filter((item) => item.insuredParty.svkkPublicId === svkkId);
    setFetchRows(exactRows);
  }, []);

  const selectFetchSuggestion = useCallback(
    async (suggestion: FetchSuggestion) => {
      setSuppressSuggestions(true);
      setFetchSvkkId(suggestion.svkkPublicId);
      setFetchHolderName(suggestion.holderName);
      setFetchSuggestions([]);
      setActiveSuggestionIndex(-1);
      setSelectedFetchId(suggestion.id);
      await loadPolicyDetailIntoForm(suggestion.id, "Loaded selected policy.");
      void loadYearRowsBySvkkId(suggestion.svkkPublicId);
    },
    [loadPolicyDetailIntoForm, loadYearRowsBySvkkId],
  );

  const handleSuggestionKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!fetchSuggestions.length) {
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev + 1) % fetchSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestionIndex((prev) => (prev <= 0 ? fetchSuggestions.length - 1 : prev - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const idx = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
        const suggestion = fetchSuggestions[idx];
        if (suggestion) {
          void selectFetchSuggestion(suggestion);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setFetchSuggestions([]);
        setActiveSuggestionIndex(-1);
      }
    },
    [activeSuggestionIndex, fetchSuggestions, selectFetchSuggestion],
  );

  const requestAutoIds = useCallback(
    async (policyGrouping: string, month: string, year: string) => {
      const trimmedGrouping = policyGrouping.trim();
      const trimmedMonth = month.trim();
      const trimmedYear = year.trim() || String(new Date().getFullYear());
      if (!trimmedGrouping || !trimmedMonth) {
        return { svkkPublicId: "", referenceNo: "" };
      }
      const svkkPromise = svkkJson<{ svkkPublicId: string }>(
        `/policies/next-svkk-id?policyGrouping=${encodeURIComponent(trimmedGrouping)}&month=${encodeURIComponent(trimmedMonth)}`,
      );
      const refPromise = svkkJson<{ referenceNo: string }>(
        `/policies/next-reference-no?policyGrouping=${encodeURIComponent(trimmedGrouping)}&month=${encodeURIComponent(trimmedMonth)}&year=${encodeURIComponent(trimmedYear)}`,
      );
      const [svkkRes, refRes] = await Promise.all([svkkPromise, refPromise]);
      const svkkSeq = (svkkRes.svkkPublicId ?? "").slice(-4).padStart(4, "0");
      const refSeq = (refRes.referenceNo ?? "").slice(-4).padStart(4, "0");
      const composed = composeIdsFromSeq(trimmedGrouping, trimmedMonth, trimmedYear, svkkSeq, refSeq);
      return {
        svkkPublicId: composed.svkkPublicId,
        referenceNo: composed.referenceNo,
        svkkSeq,
        refSeq,
      };
    },
    [],
  );

  const carryForwardPolicy = useCallback(async () => {
    if (!selectedFetchId) {
      setFetchNotice("Select a prior-year policy first.");
      toast.error("Select a prior-year policy first.");
      return;
    }
    if (carryForwardBusy) return;
    setCarryForwardBusy(true);
    const loadingToastId = toast.loading("Carrying forward policy…");
    try {
      const row = await svkkJson<SvkkPolicyDetailForForm>(`/policies/${selectedFetchId}`);
      const yearForPick =
        selectedFetch?.periodYearText?.trim() ||
        matchedYearRows.find((r) => r.id === selectedFetchId)?.year ||
        formik.values.year?.trim() ||
        undefined;
      const carriedValues = policyDetailToAdFormValues(row, { yearLabel: yearForPick });
      const preservedTwoLakhF =
        carriedValues.twoLakhF?.trim() || formik.values.twoLakhF?.trim() || "";
      const shiftedYear = nextYearLabel(carriedValues.year);
      const previousYear = carriedValues.year || "—";
      // Baseline: shift the year token inside the prior Reference No so we never
      // submit the same number for two different years. This works even when the
      // auto-id endpoint can't run (e.g. Policy Grouping is empty on the prior
      // policy). SVKK Public ID is untouched — it's holder-stable across years.
      let nextReferenceNo = shiftReferenceNoYear(carriedValues.refNo, carriedValues.year, shiftedYear);
      let autoIdNotice = "";
      try {
        const generated = await requestAutoIds(carriedValues.policyGroup, carriedValues.month, shiftedYear);
        if (generated.referenceNo) {
          nextReferenceNo = generated.referenceNo;
        } else if (nextReferenceNo === carriedValues.refNo) {
          autoIdNotice = " (reference number kept from prior policy — auto-generator unavailable)";
        } else {
          autoIdNotice = " (reference number year shifted; verify before submitting)";
        }
      } catch {
        autoIdNotice =
          nextReferenceNo === carriedValues.refNo
            ? " (reference number kept from prior policy — auto-generator unavailable)"
            : " (reference number year shifted; verify before submitting)";
      }
      const initialForReset = getAdPolicyInitialValues();
      setPremiumManual(preservedTwoLakhF ? { twoLakhF: true } : {});
      setAgeManual({});
      await formik.setValues({
        ...carriedValues,
        year: shiftedYear,
        previousPolicyNo: carriedValues.policyNo,
        previousEndDate: carriedValues.policyEnd,
        policyNo: "",
        policyStart: "",
        policyEnd: "",
        refNo: nextReferenceNo,
        twoLakhF: preservedTwoLakhF,
        grossPremium: "",
        taxAmount: "",
        svkkPremiumCalc: "",
        vkkPremium: "",
        netPremiumCalc: "",
        coPremium: "",
        commission: "",
        vkkCommission: "",
        policyHolderPremium: "",
        contribution: "",
        gaamMahajan: "",
        excessShort: "",
        differenceAmountPaidByHolder: "",
        diffAmt: "",
        // Payment & Bank Details: fully manual, never auto-carried from prior year.
        paymentMode: initialForReset.paymentMode,
        onlineTransactionRef: "",
        policyChequeNo: "",
        bank: "",
        accountNo: "",
        branch: "",
        nameAsPerCheque: "",
        ifsc: "",
        notOver: "",
        chequeDate: "",
        chequeStatus: "",
        reasonDishonoured: "",
        paymentTransactions: initialForReset.paymentTransactions,
        loanStatus: "",
        loanAmt: "",
        loanNo: "",
        cdAccountStatus: "",
        cdAmount: "",
        refundChequeAmt: "",
        refundChequeNo: "",
        refundChequeDate: "",
        notCourier: "",
        courierDate: "",
        courierCompany: "",
        podNumber: "",
        courierAddress: "",
        generalRemark: "",
        policyChangeRemark: "",
      });
      // Carry forward creates a *new* policy/year; do not show Update button.
      setFetchedPolicyForUpdate(null);
      // Seed the auto-id cache so the useEffect treats the carried state as
      // "already auto-id'd". Subsequent edits to Month / Policy Group / Year then
      // re-compose SVKK ID and Reference No from these seqs (the last 4 digits
      // of each id, by the {group}{[year]}{month}{seq:4} format).
      const carriedSvkkPublicId = carriedValues.svkkPublicId || "";
      const seededSvkkSeq = carriedSvkkPublicId.slice(-4).padStart(4, "0");
      const seededRefSeq = nextReferenceNo.slice(-4).padStart(4, "0");
      svkkSeqRef.current = seededSvkkSeq;
      refSeqRef.current = seededRefSeq;
      // Seed the group prefix. Prefer the form field; if blank, extract the
      // leading group token from the existing SVKK ID by stripping the trailing
      // 4-digit seq and the carried month token.
      const carriedGroupRaw = (carriedValues.policyGroup ?? "").trim();
      let seededGroup = carriedGroupRaw ? normalizeGroupingToken(carriedGroupRaw) : "";
      if (!seededGroup && carriedSvkkPublicId.length > 4) {
        const svkkBody = carriedSvkkPublicId.slice(0, -4);
        const carriedMonTok = monthToken(carriedValues.month ?? "");
        if (carriedMonTok && svkkBody.endsWith(carriedMonTok)) {
          seededGroup = svkkBody.slice(0, -carriedMonTok.length);
        } else {
          // Best-effort: leading uppercase-letter run.
          const m = svkkBody.match(/^[A-Z]+/);
          seededGroup = m ? m[0] : "";
        }
      }
      seededGroupRef.current = seededGroup;
      const effectiveGroupForKey = carriedGroupRaw || seededGroup;
      lastAutoIdKeyRef.current = `${effectiveGroupForKey}|${(carriedValues.month ?? "").trim()}|${shiftedYear.trim()}`;
      const summary = `Copied ${previousYear} → ${shiftedYear}. Premium (1L/2L) and basic premiums kept; payment, bank, year totals, loan, courier and remarks cleared for the new year.${autoIdNotice}`;
      setFetchNotice(summary);
      toast.success(`Carried forward to ${shiftedYear}`, {
        id: loadingToastId,
        description: summary,
      });
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Carry Forward failed.";
      setFetchNotice(msg);
      toast.error("Carry Forward failed", {
        id: loadingToastId,
        description: msg,
      });
    } finally {
      setCarryForwardBusy(false);
    }
  }, [carryForwardBusy, formik, matchedYearRows, requestAutoIds, selectedFetch, selectedFetchId]);

  const selectYearPolicy = useCallback(
    async (id: string) => {
      setSelectedFetchId(id);
      await loadPolicyDetailIntoForm(id, "Loaded selected year policy.");
    },
    [loadPolicyDetailIntoForm],
  );

  const jumpToSection = useCallback((section: AddSectionId) => {
    setActiveSection(section);
  }, []);

  const sectionForFieldPath = useCallback((path: string): AddSectionId => {
    if (!path) return "policy_details";
    if (
      path.startsWith("svkkPublicId") ||
      path.startsWith("customerId") ||
      path.startsWith("policyNo") ||
      path.startsWith("adProduct") ||
      path.startsWith("cat") ||
      path.startsWith("month") ||
      path.startsWith("year") ||
      path.startsWith("sumInsured") ||
      path.startsWith("person") ||
      path.startsWith("area") ||
      path.startsWith("village") ||
      path.startsWith("policyStart") ||
      path.startsWith("policyEnd") ||
      path.startsWith("policyGrouping")
    ) {
      return "policy_details";
    }
    if (path.startsWith("policyHolder") || path.startsWith("dob") || path.startsWith("holderGender") || path.startsWith("relation")) {
      return "policy_holder_details";
    }
    if (path.startsWith("members")) {
      return "members_details";
    }
    if (
      path.startsWith("address") ||
      path.startsWith("addressTwo") ||
      path.startsWith("addressThree") ||
      path.startsWith("addressFour") ||
      path.startsWith("city") ||
      path.startsWith("pincode") ||
      path.startsWith("mobileFirst") ||
      path.startsWith("mobileSecond") ||
      path.startsWith("whatsappNo") ||
      path.startsWith("email")
    ) {
      return "address_contacts";
    }
    if (
      path.startsWith("basicPremiumPs") ||
      path.startsWith("grossPremium") ||
      path.startsWith("commission") ||
      path.startsWith("twoLakhF") ||
      path.startsWith("policyHolderPremium") ||
      path.startsWith("gaamMahajan") ||
      path.startsWith("excessShort") ||
      path.startsWith("diffAmt") ||
      path.startsWith("taxPercent") ||
      path.startsWith("taxAmount") ||
      path.startsWith("svkkPremiumCalc") ||
      path.startsWith("netPremiumCalc") ||
      path.startsWith("vkkCommission") ||
      path.startsWith("contribution") ||
      path.startsWith("differenceAmountPaidByHolder")
    ) {
      return "premium_details";
    }
    if (
      path.startsWith("paymentMode") ||
      path.startsWith("onlineTransactionRef") ||
      path.startsWith("policyChequeNo") ||
      path.startsWith("bank") ||
      path.startsWith("accountNo") ||
      path.startsWith("branch") ||
      path.startsWith("nameAsPerCheque") ||
      path.startsWith("ifsc") ||
      path.startsWith("notOver") ||
      path.startsWith("chequeDate") ||
      path.startsWith("chequeStatus") ||
      path.startsWith("reasonDishonoured") ||
      path.startsWith("paymentTransactions")
    ) {
      return "payment_bank_details";
    }
    if (path.startsWith("nominee")) {
      return "nominee_details";
    }
    if (
      path.startsWith("loanStatus") ||
      path.startsWith("loanNo") ||
      path.startsWith("loanAmt") ||
      path.startsWith("cdAccountStatus") ||
      path.startsWith("cdAmount") ||
      path.startsWith("refundChequeAmt") ||
      path.startsWith("refundChequeNo") ||
      path.startsWith("refundChequeDate")
    ) {
      return "loan_details";
    }
    if (path.startsWith("courier") || path.startsWith("podNumber") || path.startsWith("notCourier")) {
      return "courier";
    }
    if (path.startsWith("generalRemark") || path.startsWith("policyChangeRemark")) {
      return "remark";
    }
    return "policy_details";
  }, []);

  const redirectToFirstError = useCallback(
    async (formErrors: unknown) => {
      const keys = formErrors && typeof formErrors === "object" ? Object.keys(formErrors as Record<string, unknown>) : [];
      const firstPath = keys[0] ?? "";
      const section = sectionForFieldPath(firstPath);
      setActiveSection(section);

      // Ensure errors render even if the field wasn't touched yet.
      await formik.setTouched({ ...(touched as any), [firstPath]: true } as any, true);

      // Try to focus/scroll the first invalid input for immediate visibility.
      requestAnimationFrame(() => {
        const root = formRootRef.current;
        if (!root) return;
        const el =
          (root.querySelector(`[name="${CSS.escape(firstPath)}"]`) as HTMLElement | null) ??
          (root.querySelector(`[id="${CSS.escape(firstPath)}"]`) as HTMLElement | null);
        el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.focus?.();
      });
    },
    [formik, sectionForFieldPath, touched],
  );

  const resetFetchedPolicyState = useCallback(async () => {
    await formik.setValues(getAdPolicyInitialValues());
    setFetchHolderName("");
    setFetchRows([]);
    setSelectedFetchId("");
    setFetchSuggestions([]);
    setActiveSuggestionIndex(-1);
    setFetchNotice(null);
  }, [formik]);

  const openReceiptPreviewFromForm = useCallback(() => {
    const adVariant = toAdProductVariant(values.adProduct) ?? null;
    const personsFromInput = Number(values.person);
    const personCount =
      Number.isFinite(personsFromInput) && personsFromInput > 0
        ? Math.floor(personsFromInput)
        : Math.max(values.members.length + 1, 1);
    const firstTxn = values.paymentTransactions[0];
    const remarksCombined = [values.policyChangeRemark]
      .map((v) => v.trim())
      .filter(Boolean)
      .join("\n\n");
    const payload: PolicyDetailForReceipt = {
      id: policyId,
      policyNo: values.policyNo.trim() || null,
      previousPolicyNo: values.previousPolicyNo.trim() || null,
      referenceNo: values.refNo.trim() || null,
      adProductVariant: adVariant,
      area: values.area.trim() || null,
      village: values.village.trim() || null,
      personsInsuredCount: personCount,
      remarks: remarksCombined || null,
      generalRemark: values.generalRemark.trim() || null,
      periodYearText: values.year.trim() || null,
      periodMonthText: values.month.trim() || null,
      insuredParty: {
        name: values.policyHolder.trim() || "Policy Holder",
        svkkPublicId: values.svkkPublicId.trim() || "—",
        customerId: values.customerId.trim() || null,
        pan: values.panNo.trim() || null,
        aadhaarNo: values.aadhaarNo.trim() || null,
        mobile: values.mobileFirst.trim() || values.whatsappNo.trim() || null,
        email: values.email.trim() || null,
      },
      policyType: { name: values.adProduct || "Policy" },
      category: values.cat.trim() ? { key: values.cat.trim(), name: values.cat.trim() } : null,
      years: [
        {
          yearLabel: values.year.trim() || String(new Date().getFullYear()),
          sumInsured: parseInr(values.sumInsured),
          vkkPremium: parseInr(values.vkkPremium || values.svkkPremiumCalc),
          amountReceived: parseInr(firstTxn?.amountReceived ?? ""),
          bankName: firstTxn?.bankName?.trim() || values.bank.trim() || null,
          utrRef: values.onlineTransactionRef.trim() || null,
          yearRemarks: remarksCombined || null,
          members: values.members.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim() })),
          receipts: [],
          payments:
            firstTxn && (firstTxn.amountReceived || firstTxn.transactionNumber || firstTxn.bankName)
              ? [
                  {
                    method: firstTxn.mode || null,
                    amount: parseInr(firstTxn.amountReceived),
                    cheque:
                      firstTxn.mode === "CHEQUE"
                        ? {
                            number: firstTxn.transactionNumber || "",
                            bankName: firstTxn.bankName || "",
                            chequeDate: firstTxn.transactionDate || null,
                            status: firstTxn.transactionStatus || null,
                            reason: firstTxn.dishonourReason || null,
                          }
                        : null,
                    transactionMode: firstTxn.mode || null,
                    transactionDetail: firstTxn.transactionNumber || null,
                    transactionDate: firstTxn.transactionDate || null,
                    nameAsPerCheque: firstTxn.nameAsPerCheque?.trim() || null,
                    notOver: firstTxn.notOver?.trim() || null,
                    returnCharges: parseInr(firstTxn.returnCharges ?? ""),
                    otherCharges: parseInr(firstTxn.otherCharges ?? ""),
                  },
                ]
              : [],
        },
      ],
    };
    setReceiptPreviewHtml(buildReceiptDocumentHtml(payload, { embedded: true, ...receiptImageUrls }));
  }, [policyId, values, receiptImageUrls]);

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    void (async () => {
      if (!isEdit) {
        setLoadErr(null);
      }
      try {
        await loadAdPolicyType();
      } catch (e) {
        if (!isEdit) {
          setLoadErr(e instanceof Error ? e.message : "Failed to load policy type");
        }
      }
    })();
  }, [missingUrl, loadAdPolicyType, isEdit]);

  useEffect(() => {
    if (missingUrl || !isEdit || !policyId) {
      return;
    }
    void (async () => {
      setDetailErr(null);
      try {
        const row = await svkkJson<SvkkPolicyDetailForForm>(`/policies/${policyId}`);
        setDetail(row);
      } catch (e) {
        setDetailErr(e instanceof Error ? e.message : "Failed to load policy");
      }
    })();
  }, [missingUrl, isEdit, policyId]);

  useEffect(() => {
    if (!isEdit || !detail) {
      return;
    }
    if (detail.policyType?.id) {
      setPolicyTypeId(detail.policyType.id);
    }
    const yearRow = pickPolicyYear(detail.years, editYearLabel);
    if (yearRow?.policyChart?.id) {
      setPolicyChartId(yearRow.policyChart.id);
    }
  }, [isEdit, detail, editYearLabel]);

  const detailHydrationKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isEdit || !detail) {
      return;
    }
    const hydrationKey = `${detail.id}|${detail.updatedAt}|${editYearLabel}`;
    if (detailHydrationKeyRef.current === hydrationKey) {
      return;
    }
    detailHydrationKeyRef.current = hydrationKey;
    const nextValues = policyDetailToAdFormValues(detail, { yearLabel: editYearLabel });
    void formik.setValues(nextValues);
    setPremiumManual({});
    setAgeManual({});
  }, [isEdit, detail, editYearLabel, formik.setValues]);

  useEffect(() => {
    // Lock auto-id only when we are updating an existing policy. After Carry
    // Forward the user is creating a NEW policy (selectedFetchId is set, but
    // fetchedPolicyForUpdate is null), so auto-id must remain reactive to Month /
    // Year / Policy Group changes.
    if (isEdit || fetchedPolicyForUpdate) {
      return;
    }
    const groupFromForm = values.policyGroup.trim();
    const effectiveGroup = groupFromForm || seededGroupRef.current;
    const month = values.month.trim();
    const year = values.year.trim();
    if (!effectiveGroup || !month) {
      // Don't blow away IDs that were seeded by Carry Forward when Policy Group is
      // unset on the prior policy; just stop computing until the user picks one.
      return;
    }
    const key = `${effectiveGroup}|${month}|${year}`;
    if (lastAutoIdKeyRef.current === key) {
      return;
    }
    lastAutoIdKeyRef.current = key;
    if (svkkSeqRef.current && refSeqRef.current) {
      const composed = composeIdsFromSeq(effectiveGroup, month, year, svkkSeqRef.current, refSeqRef.current);
      void setFieldValue("svkkPublicId", composed.svkkPublicId.toUpperCase());
      void setFieldValue("refNo", composed.referenceNo.toUpperCase());
      return;
    }
    void (async () => {
      try {
        const generated = await requestAutoIds(effectiveGroup, month, year);
        // If the endpoint returns nothing (e.g. policy grouping unrecognized), do
        // NOT overwrite existing IDs with empty strings.
        if (!generated.svkkPublicId && !generated.referenceNo) {
          return;
        }
        svkkSeqRef.current = generated.svkkSeq || svkkSeqRef.current;
        refSeqRef.current = generated.refSeq || refSeqRef.current;
        if (generated.svkkPublicId) {
          void setFieldValue("svkkPublicId", generated.svkkPublicId.toUpperCase());
        }
        if (generated.referenceNo) {
          void setFieldValue("refNo", generated.referenceNo.toUpperCase());
        }
      } catch {
        // keep manual editing possible if generator fails
      }
    })();
  }, [isEdit, fetchedPolicyForUpdate, requestAutoIds, setFieldValue, values]);

  useEffect(() => {
    if (isEdit || missingUrl) {
      return;
    }
    if (suppressSuggestions) {
      return;
    }
    const query = fetchSvkkId.trim() || fetchHolderName.trim();
    if (query.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFetchSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void loadFetchSuggestions(query);
    }, 120);
    return () => clearTimeout(timer);
  }, [isEdit, missingUrl, suppressSuggestions, fetchSvkkId, fetchHolderName, loadFetchSuggestions]);

  const ageAnchorDate = values.previousEndDate || values.policyEnd;

  useEffect(() => {
    if (freezeAutoCalculations || ageManual.age) return;
    const next = ageFromDobOnAnchor(values.dob, ageAnchorDate);
    if (values.age !== next) {
      void setFieldValue("age", next);
    }
  }, [freezeAutoCalculations, ageManual.age, values.age, values.dob, ageAnchorDate, setFieldValue]);

  useEffect(() => {
    if (freezeAutoCalculations) return;
    if (!values.members.length) {
      return;
    }
    const next = values.members.map((member, index) => {
      if (ageManual[`members[${index}].age`]) {
        return member;
      }
      return {
        ...member,
        age: ageFromDobOnAnchor(member.dob, ageAnchorDate),
      };
    });
    const changed = next.some((member, index) => member.age !== values.members[index]?.age);
    if (changed) {
      void setFieldValue("members", next);
    }
  }, [freezeAutoCalculations, ageAnchorDate, ageManual, setFieldValue, values.members]);

  const updateMember = (i: number, patch: Partial<AdMemberRow>) => {
    const next = [...values.members];
    next[i] = { ...next[i]!, ...patch };
    if (!freezeAutoCalculations && patch.dob !== undefined && !ageManual[`members[${i}].age`]) {
      next[i]!.age = ageFromDobOnAnchor(next[i]!.dob, ageAnchorDate);
    }
    void setFieldValue("members", next);
  };

  const addMember = () => {
    const nextMembers = [...values.members, emptyMemberRow()];
    void setFieldValue("members", nextMembers);
    void setFieldValue("person", String(nextMembers.length + 1));
  };
  const removeMember = (i: number) => {
    if (values.members.length <= 0) {
      return;
    }
    const nextMembers = values.members.filter((_, j) => j !== i);
    void setFieldValue("members", nextMembers);
    void setFieldValue("person", String(nextMembers.length + 1));
  };

  const addPaymentTransaction = () => {
    void setFieldValue("paymentTransactions", [
      ...values.paymentTransactions,
      {
        mode: "ONLINE",
        mobileNumber: "",
        transactionNumber: "",
        bankName: "",
        branch: "",
        accountNumber: "",
        nameAsPerCheque: "",
        ifscCode: "",
        notOver: "",
        transactionDate: "",
        transactionStatus: "",
        dishonourReason: "",
        returnCharges: "",
        otherCharges: "",
        amountReceived: "",
      },
    ]);
  };

  const removePaymentTransaction = (index: number) => {
    if (values.paymentTransactions.length <= 1) {
      return;
    }
    void setFieldValue(
      "paymentTransactions",
      values.paymentTransactions.filter((_, i) => i !== index),
    );
  };

  useEffect(() => {
    if (freezeAutoCalculations) return;
    const parsed = Number(values.person);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return;
    }
    const requiredMembers = Math.max(Math.floor(parsed) - 1, 0);
    if (values.members.length === requiredMembers) {
      return;
    }
    if (values.members.length < requiredMembers) {
      const next = [...values.members];
      while (next.length < requiredMembers) {
        next.push(emptyMemberRow());
      }
      void setFieldValue("members", next);
    } else {
      const next = Array.from({ length: requiredMembers }, () => emptyMemberRow());
      void setFieldValue("members", next);
    }
    // Intentionally not depending on values.members to avoid feedback loop
    // with addMember/removeMember (which set both fields atomically).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freezeAutoCalculations, values.person, setFieldValue]);

  useEffect(() => {
    if (freezeAutoCalculations) return;
    const setAutoField = (
      field: keyof AdPolicyFormValues,
      value: number,
      roundOff = false,
      showZero = false,
    ) => {
      if (premiumManual[String(field)]) {
        return;
      }
      const next = showZero ? toMoneyStringAllowZero(value) : roundOff ? toRoundedIntegerString(value) : toMoneyString(value);
      if (String(values[field] ?? "") !== next) {
        void setFieldValue(field, next);
      }
    };

    const memberBasics = values.members.map((m) => ({
      relation: (m.relationship || "").trim().toUpperCase(),
      premium: parseInr(m.basicPremium),
    }));
    const holderBasic = parseInr(values.basicPremiumPs);
    const allBasicPremiums = [holderBasic, ...memberBasics.map((m) => m.premium)];
    const insuredCountRaw = Number(values.person);
    const insuredCount = Number.isFinite(insuredCountRaw) && insuredCountRaw > 0 ? Math.floor(insuredCountRaw) : allBasicPremiums.length;
    const product = (values.adProduct || "").trim().toUpperCase();

    const familyFloaterRate = insuredCount >= 4 ? 0.15 : insuredCount === 3 ? 0.1 : insuredCount === 2 ? 0.05 : 0;
    const grossFromChart = allBasicPremiums.reduce((sum, premium) => sum + premium, 0);
    const familyFloaterNet = allBasicPremiums.reduce((sum, premium) => {
      const discount = Math.ceil(premium * familyFloaterRate);
      return sum + (premium - discount);
    }, 0);

    const ashaKiranEligible = insuredCount <= 4;
    const ashaKiranNet = ashaKiranEligible
      ? holderBasic +
        memberBasics.reduce((sum, row) => {
          if (row.relation.includes("DAUGHTER")) {
            const discount = Math.floor(row.premium * 0.5);
            return sum + (row.premium - discount);
          }
          return sum + row.premium;
        }, 0)
      : familyFloaterNet;

    const autoGross = product === "SENIOR_CITIZEN" ? parseInr(values.grossPremium) : grossFromChart;
    let autoNet = parseInr(values.coPremium);
    if (product === "FAMILY_FLOATER") {
      autoNet = familyFloaterNet;
    } else if (product === "ASHA_KIRAN") {
      autoNet = ashaKiranNet;
    } else if (product === "INDIVIDUAL") {
      autoNet = grossFromChart;
    }

    const gross = premiumManual.grossPremium ? parseInr(values.grossPremium) : autoGross;
    const net = premiumManual.coPremium ? parseInr(values.coPremium) : autoNet;
    const taxPercent = parseInr(values.taxPercent);
    const taxAmountCalc = gross * (taxPercent / 100);
    const taxAmount = premiumManual.taxAmount ? parseInr(values.taxAmount) : taxAmountCalc;
    const svkkPremiumCalc = gross + taxAmount;
    const svkkPremiumRounded = Math.round(svkkPremiumCalc);
    const commissionCalc = gross * 0.15;
    const commission = premiumManual.commission ? parseInr(values.commission) : commissionCalc;
    const vkkCommissionCalc = commission * 0.5;
    const vkkCommission = premiumManual.vkkCommission ? parseInr(values.vkkCommission) : vkkCommissionCalc;

    const personCount = Math.max(insuredCount, 1);
    const oneOrTwoLakhPremium = parseInr(values.twoLakhF);
    let holderPremiumCalc = net;
    const category = values.cat.toUpperCase();
    if (category === "C") holderPremiumCalc = 3000 * personCount;
    else if (category === "B") holderPremiumCalc = oneOrTwoLakhPremium * 0.5;
    else if (category === "A" || category === "D") holderPremiumCalc = net;
    const holderPremium = premiumManual.policyHolderPremium
      ? parseInr(values.policyHolderPremium)
      : holderPremiumCalc;

    const contributionCalc = oneOrTwoLakhPremium - holderPremium;
    const contribution = premiumManual.contribution ? parseInr(values.contribution) : contributionCalc;
    const excessShortCalc = net - svkkPremiumRounded;
    const excessShort = premiumManual.excessShort ? parseInr(values.excessShort) : excessShortCalc;
    const differenceAmountCalc = net - oneOrTwoLakhPremium + holderPremium;
    const differenceAmountPaidByHolder = premiumManual.differenceAmountPaidByHolder
      ? parseInr(values.differenceAmountPaidByHolder)
      : differenceAmountCalc;

    setAutoField("grossPremium", gross);
    setAutoField("coPremium", net);
    setAutoField("netPremiumCalc", net);
    setAutoField("taxAmount", taxAmount);
    setAutoField("svkkPremiumCalc", svkkPremiumCalc, true);
    setAutoField("vkkPremium", svkkPremiumCalc, true);
    setAutoField("commission", commission, true);
    setAutoField("vkkCommission", vkkCommission);
    setAutoField("policyHolderPremium", holderPremium, true);
    setAutoField("contribution", contribution);
    setAutoField("gaamMahajan", contribution);
    setAutoField("excessShort", excessShort, false, true);
    setAutoField("differenceAmountPaidByHolder", differenceAmountPaidByHolder);
    setAutoField("diffAmt", differenceAmountPaidByHolder);
  }, [freezeAutoCalculations, premiumManual, setFieldValue, values]);

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }
  if (isEdit) {
    if (detailErr) {
      return <p className="text-destructive text-sm">{detailErr}</p>;
    }
    if (!detail) {
      return <p className="text-muted-foreground text-sm">Loading policy…</p>;
    }
  } else if (loadErr) {
    return <p className="text-destructive text-sm">{loadErr}</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10 select-text">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            {isEdit ? (
              <FilePenLine className="text-primary size-6" />
            ) : (
              <FilePlus className="text-primary size-6" />
            )}
            <h1 className="text-2xl font-semibold">{isEdit ? "Edit AD policy" : "Add AD policy"}</h1>
          </div>
        </div>
      </div>

      <form
        ref={formRootRef}
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            const formErrors = await formik.validateForm();
            if (Object.keys(formErrors).length > 0) {
              setApiErr("Please fill all required fields (check each section) and try again.");
              await redirectToFirstError(formErrors);
              return;
            }
            setApiErr(null);
            await formik.submitForm();
          })();
        }}
        className="space-y-6 select-text"
        noValidate
      >
        {apiErr ? <p className="text-destructive text-sm">{apiErr}</p> : null}

        {!isEdit ? (
          <Card>
            <CardHeader>
              <CardTitle>Add Policy</CardTitle>
              <CardDescription>Fetch old policy by SVKK ID or carry forward all fields.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label>SVKK ID</Label>
                  <Input
                    value={fetchSvkkId}
                    onChange={(e) => {
                      setSuppressSuggestions(false);
                      const nextSvkkId = e.target.value.toUpperCase();
                      setFetchSvkkId(nextSvkkId);
                      if (!nextSvkkId.trim()) {
                        void resetFetchedPolicyState();
                      }
                    }}
                    onKeyDown={handleSuggestionKeyDown}
                    placeholder="Type SVKK ID"
                  />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Policy Holder</RequiredLabel>
                  <Input
                    value={fetchHolderName}
                    onChange={(e) => {
                      setSuppressSuggestions(false);
                      setFetchHolderName(e.target.value);
                    }}
                    onKeyDown={handleSuggestionKeyDown}
                    placeholder="Type customer name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Policy Type</Label>
                  <Input
                    value={
                      selectedFetch?.adProductVariant
                        ? (adProductFormValueFromApi(selectedFetch.adProductVariant) || selectedFetch.adProductVariant)
                        : values.adProduct || "—"
                    }
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Current Year</Label>
                  <Input
                    value={selectedFetch?.periodYearText ?? (values.year || "—")}
                    readOnly
                    className="bg-muted"
                  />
                </div>
              </div>
              {fetchSuggestions.length > 0 ? (
                <div className="rounded-md border">
                  <div className="bg-muted/50 px-3 py-2 text-xs font-medium">
                    {suggestBusy ? "Searching..." : "Suggestions"}
                  </div>
                  <div className="max-h-56 overflow-auto p-2">
                    <div className="grid gap-2">
                      {fetchSuggestions.map((s) => (
                        <button
                          key={s.svkkPublicId}
                          type="button"
                          className={`hover:bg-muted flex items-center justify-between rounded border px-3 py-2 text-left text-sm ${
                            fetchSuggestions[activeSuggestionIndex]?.svkkPublicId === s.svkkPublicId
                              ? "bg-muted border-primary"
                              : ""
                          }`}
                          onClick={() => void selectFetchSuggestion(s)}
                        >
                          <span>
                            <span className="font-medium">{s.holderName}</span>
                            <span className="text-muted-foreground ml-2">{s.svkkPublicId}</span>
                          </span>
                          <span className="text-muted-foreground text-xs">{s.customerId ?? "—"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void carryForwardPolicy()}
                  disabled={carryForwardBusy || !selectedFetchId}
                  aria-busy={carryForwardBusy}
                  title={!selectedFetchId ? "Select a prior-year policy first." : "Copy fields from the selected year to a new year."}
                >
                  {carryForwardBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  )}
                  {carryForwardBusy ? "Carrying forward…" : "Carry Forward / Renew"}
                </Button>
                {!selectedFetchId ? (
                  <span className="text-muted-foreground text-xs">
                    Select a prior-year policy first.
                  </span>
                ) : null}
              </div>
              {matchedYearRows.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm">{matchedYearRows.length} year-wise policies found for this SVKK ID.</p>
                  <div className="flex flex-wrap gap-2">
                    {matchedYearRows.map((row) => (
                      <Button
                        key={row.id}
                        type="button"
                        variant={selectedFetchId === row.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => void selectYearPolicy(row.id)}
                      >
                        {row.year}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              {fetchNotice ? <p className="text-muted-foreground text-sm">{fetchNotice}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        {!isEdit ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-muted-foreground text-xs">SVKK ID</p>
                  <p className="font-semibold">{values.svkkPublicId || "—"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-muted-foreground text-xs">Customer ID</p>
                  <p className="font-semibold">{values.customerId || "—"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-muted-foreground text-xs">Policy No</p>
                  <p className="font-semibold break-all">{values.policyNo || "—"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-muted-foreground text-xs">Policy Type</p>
                  <p className="font-semibold">{values.adProduct || "—"}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-muted-foreground text-xs">VKK Premium</p>
                  <p className="font-semibold">₹ {formatInr(parseInr(values.vkkPremium))}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Calculated Premium Summary</CardTitle>
                <CardDescription>
                  This stays below SVKK ID / Customer ID / Policy No / Policy Type / VKK Premium for exact member-wise calculation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Basic Premium</p><p className="font-semibold">₹{rs(summary.basic)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Add-on Rider</p><p className="font-semibold">₹{rs(summary.rider)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Gross Premium</p><p className="font-semibold">₹{rs(summary.gross)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Discount</p><p className="font-semibold">₹{rs(summary.discount)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Net Premium</p><p className="font-semibold">₹{rs(summary.net)}</p></CardContent></Card>
                </div>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full min-w-[960px] text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Person</th>
                        <th className="p-2 text-left">Role</th>
                        <th className="p-2 text-left">DOB</th>
                        <th className="p-2 text-left">Age</th>
                        <th className="p-2 text-left">Relationship</th>
                        <th className="p-2 text-left">Gender</th>
                        <th className="p-2 text-left">Band</th>
                        <th className="p-2 text-right">Basic</th>
                        <th className="p-2 text-right">Rider</th>
                        <th className="p-2 text-right">Gross</th>
                        <th className="p-2 text-right">Discount %</th>
                        <th className="p-2 text-right">Discount</th>
                        <th className="p-2 text-right">Net</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.rows.map((row, idx) => {
                        const isHolder = idx === 0;
                        const displayName =
                          row.name || (isHolder ? values.policyHolder || "Holder" : `Member ${idx}`);
                        return (
                          <tr key={`${displayName}-${idx}`} className="border-t">
                            <td className="p-2 font-medium">{displayName}</td>
                            <td className="p-2 capitalize">{row.role}</td>
                            <td className="p-2">{row.dob || "—"}</td>
                            <td className="p-2 tabular-nums">{row.age ?? "—"}</td>
                            <td className="p-2 capitalize">{row.relationship || "—"}</td>
                            <td className="p-2 capitalize">{row.gender || "—"}</td>
                            <td className="p-2">{row.band || "—"}</td>
                            <td className="p-2 text-right tabular-nums">
                              {row.error ? "—" : `₹${rs(row.basic ?? 0)}`}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {row.error ? "—" : `₹${rs(row.rider ?? 0)}`}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {row.error ? "—" : `₹${rs(row.gross ?? 0)}`}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {row.error ? "—" : `${row.pct ?? 0}%`}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {row.error ? "—" : `₹${rs(row.disc ?? 0)}`}
                            </td>
                            <td className="p-2 text-right font-semibold tabular-nums">
                              {row.error ? "—" : `₹${rs(row.net ?? 0)}`}
                            </td>
                            <td className="p-2">
                              {row.error ? (
                                "—"
                              ) : (
                                <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                                  Ready
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}

        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          {ADD_SECTIONS.map((section) => (
            <Button
              key={section.id}
              type="button"
              variant={activeSection === section.id ? "default" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => jumpToSection(section.id)}
            >
              {section.label}
            </Button>
          ))}
        </div>

        {activeSection === "policy_details" ? (
          <Card id="section-policy-details">
            <CardHeader>
              <CardTitle>Policy Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <AutoFieldLabel hint="Auto-generated from Policy Group + Month sequence. You can override manually.">
                  SVKK ID
                </AutoFieldLabel>
                <Input
                  name="svkkPublicId"
                  value={values.svkkPublicId}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label>Customer ID</Label>
                <Input
                  name="customerId"
                  value={values.customerId}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label>Policy No</Label>
                <Input name="policyNo" value={values.policyNo} onChange={handleChange} onBlur={handleBlur} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Policy Type</RequiredLabel>
                <Select
                  value={values.adProduct || "__none__"}
                  onValueChange={(v) => void setFieldValue("adProduct", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select policy type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select policy type</SelectItem>
                    {AD_PRODUCT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormikError name="adProduct" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Category</RequiredLabel>
                <DropdownCombobox
                  value={values.cat}
                  onChange={(v) => void setFieldValue("cat", v)}
                  options={categoryOptions}
                  placeholder="Select category"
                  searchPlaceholder="Search category"
                />
                <FormikError name="cat" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Month</RequiredLabel>
                <Select
                  value={values.month || "__none__"}
                  onValueChange={(v) => void setFieldValue("month", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select month</SelectItem>
                    {POLICY_PERIOD_MONTH_LABELS_CALENDAR_ORDER.map((month) => (
                      <SelectItem key={month} value={month}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormikError name="month" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Year</RequiredLabel>
                <Input
                  name="year"
                  value={values.year}
                  onChange={handleChange}
                  onBlur={(e) => {
                    handleBlur(e);
                    const normalized = normalizeYearLabel(e.target.value);
                    if (normalized !== e.target.value) {
                      void setFieldValue("year", normalized);
                    }
                  }}
                  placeholder="e.g. 2025-26"
                />
                <FormikError name="year" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Sum Insured (SI)</RequiredLabel>
                <DropdownCombobox
                  value={values.sumInsured}
                  onChange={(v) => void setFieldValue("sumInsured", v)}
                  options={sumInsuredOptions}
                  placeholder="Select sum insured"
                  searchPlaceholder="Search amount"
                />
                <FormikError name="sumInsured" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Person</RequiredLabel>
                <Input name="person" value={values.person} onChange={handleChange} onBlur={handleBlur} placeholder="e.g. 1" />
                <FormikError name="person" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Village</RequiredLabel>
                <DropdownCombobox
                  value={values.village}
                  onChange={(v) => void setFieldValue("village", v)}
                  options={villageOptions}
                  placeholder="Select village"
                  searchPlaceholder="Search village"
                />
                <FormikError name="village" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Area</RequiredLabel>
                <DropdownCombobox
                  value={values.area}
                  onChange={(v) => void setFieldValue("area", v)}
                  options={areaOptions}
                  placeholder="Select area"
                  searchPlaceholder="Search area"
                />
                <FormikError name="area" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <Label>Policy End Date</Label>
                <Input name="policyEnd" type="date" value={values.policyEnd} onChange={handleChange} onBlur={handleBlur} />
                <FormikError name="policyEnd" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <Label>Previous Policy No</Label>
                <Input name="previousPolicyNo" value={values.previousPolicyNo} onChange={handleChange} onBlur={handleBlur} />
              </div>
              <div className="space-y-2">
                <Label>Previous End Date (Age anchor)</Label>
                <Input
                  name="previousEndDate"
                  type="date"
                  value={values.previousEndDate}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
              <div className="space-y-2">
                <Label>Policy Group</Label>
                <DropdownCombobox
                  value={values.policyGroup}
                  onChange={(v) => void setFieldValue("policyGroup", v)}
                  options={policyGroupOptions}
                  placeholder="Select policy group"
                  searchPlaceholder="Search policy group"
                />
                <FormikError name="policyGroup" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <Label>Policy Start</Label>
                <Input name="policyStart" type="date" value={values.policyStart} onChange={handleChange} onBlur={handleBlur} />
                <FormikError name="policyStart" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <Label>Insurance company</Label>
                <Input name="company" value={values.company} onChange={handleChange} onBlur={handleBlur} />
              </div>
              <div className="space-y-2">
                <Label>TPA</Label>
                <Input name="tpa" value={values.tpa} onChange={handleChange} onBlur={handleBlur} />
              </div>
              <div className="space-y-2">
                <Label>Cumulative Bonus</Label>
                <Input
                  name="comulativeBonus"
                  value={values.comulativeBonus}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
              <div className="space-y-2">
                <AutoFieldLabel hint="Auto-generated from Policy Group + Year + Month sequence. You can override manually.">
                  Reference No
                </AutoFieldLabel>
                <Input name="refNo" value={values.refNo} onChange={handleChange} onBlur={handleBlur} />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                <Label>Policy URL {values.urls.length > 0 && <span className="text-muted-foreground ml-1 text-xs font-normal">{values.urls.length} / 5</span>}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {values.urls.map((u, i) => (
                    <span key={i} className="border-input bg-muted/40 inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm">
                      <a
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex min-w-0 items-center gap-1 truncate hover:underline"
                        title={u}
                      >
                        <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{u}</span>
                      </a>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive -mr-1 shrink-0 rounded p-0.5 transition-colors"
                        onClick={() => void setFieldValue("urls", values.urls.filter((_, j) => j !== i))}
                        aria-label="Remove this URL"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
                  {canDriveUpload && !missingUrl && values.urls.length < 5 ? (
                    <PolicyDriveUploadButton
                      policyId={isEdit ? policyId : undefined}
                      expectedUpdatedAt={isEdit && detail ? detail.updatedAt : undefined}
                      maxFiles={5 - values.urls.length}
                      onUploaded={(newUrls, meta) => {
                        const next = [...values.urls, ...newUrls].slice(0, 5);
                        void setFieldValue("urls", next);
                        if (isEdit && detail && meta?.updatedAt) {
                          setDetail((d) => (d ? { ...d, updatedAt: meta.updatedAt!, policyUrl: JSON.stringify(next) } : d));
                        }
                      }}
                    />
                  ) : null}
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                <Label>URL</Label>
                <Input
                  name="url2"
                  value={values.url2}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className="min-w-0 flex-1"
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "policy_holder_details" ? (
          <Card id="section-policy-holder-details">
            <CardHeader>
              <CardTitle>Policy Holder Details</CardTitle>
              <CardDescription>
                Holder Name, PAN, Village, DOB, Age (auto from policy end date; editable), Relationship, Joining Date, Gender, Add-ons.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 sm:col-span-2">
                <RequiredLabel>Holder Name</RequiredLabel>
                <Input
                  name="policyHolder"
                  value={values.policyHolder}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  autoComplete="name"
                />
                <FormikError name="policyHolder" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <Label>PAN Card</Label>
                <Input
                  id={`${idPrefix}-pan`}
                  name="panNo"
                  value={values.panNo}
                  onChange={(e) => void setFieldValue("panNo", e.target.value.toUpperCase())}
                  onBlur={handleBlur}
                  maxLength={10}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label>Aadhaar No.</Label>
                <Input
                  name="aadhaarNo"
                  value={values.aadhaarNo}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  maxLength={12}
                  autoComplete="off"
                  placeholder="12-digit Aadhaar number"
                />
                <FormikError name="aadhaarNo" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Village</RequiredLabel>
                <DropdownCombobox
                  value={values.village}
                  onChange={(v) => void setFieldValue("village", v)}
                  options={villageOptions}
                  placeholder="Select village"
                  searchPlaceholder="Search village"
                />
                <FormikError name="village" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${idPrefix}-dob`}>DOB</Label>
                <Input
                  id={`${idPrefix}-dob`}
                  name="dob"
                  type="date"
                  value={values.dob}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
                <FormikError name="dob" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <DropdownCombobox
                  value={values.holderGender}
                  onChange={(v) => void setFieldValue("holderGender", v)}
                  options={genderOptions}
                  placeholder="Select gender"
                  searchPlaceholder="Search gender"
                />
                <FormikError name="holderGender" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <Label>Relationship</Label>
                <DropdownCombobox
                  value={values.relation}
                  onChange={(v) => void setFieldValue("relation", v)}
                  options={relationOptions}
                  placeholder="Select relation"
                  searchPlaceholder="Search relation"
                />
                <FormikError name="relation" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <Label>Joining Date</Label>
                <Input
                  name="holderJoiningDate"
                  type="date"
                  value={values.holderJoiningDate}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
              <div className="space-y-2">
                <Label>Add-ons (Amount rs)</Label>
                <Input
                  name="holderAddOns"
                  value={values.holderAddOns}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
              <div className="space-y-2">
                <Label>Basic Premium</Label>
                <Input
                  name="basicPremiumPs"
                  value={values.basicPremiumPs}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  inputMode="decimal"
                  placeholder="e.g. 5000"
                />
              </div>
              <div className="space-y-2">
                <Label>Age</Label>
                <Input
                  name="age"
                  value={values.age}
                  onChange={(e) => {
                    markAgeManual("age");
                    handleChange(e);
                  }}
                  onBlur={handleBlur}
                  inputMode="numeric"
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "members_details" ? (
        <Card id="section-members-details">
          <CardHeader>
            <CardTitle>Members Details</CardTitle>
            <CardDescription>
              Member Name, Relation, Date of Birth, Age, Gender, Joining Date, Sum Insured, Cumulative Bonus, Phone Number, Add ons.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {values.members.map((m, i) => (
              <div
                key={i}
                className="relative rounded-lg border p-3"
              >
                <p className="text-muted-foreground mb-2 text-xs font-medium">Member {i + 1}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <Label>Member Name</Label>
                    <Input
                      name={`members[${i}].name`}
                      value={m.name}
                      onChange={handleChange}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Relation</Label>
                    <DropdownCombobox
                      value={m.relationship}
                      onChange={(v) => updateMember(i, { relationship: v })}
                      options={relationOptions}
                      placeholder="Select relation"
                      searchPlaceholder="Search relation"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Date of Birth</Label>
                    <Input
                      type="date"
                      name={`members[${i}].dob`}
                      value={m.dob}
                      onChange={(e) => {
                        const d = e.target.value;
                        void setFieldValue(`members[${i}].dob`, d);
                        if (!freezeAutoCalculations && !ageManual[`members[${i}].age`]) {
                          void setFieldValue(`members[${i}].age`, ageFromDobOnAnchor(d, ageAnchorDate));
                        }
                      }}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Age</Label>
                    <Input
                      name={`members[${i}].age`}
                      value={m.age}
                      onChange={(e) => {
                        markAgeManual(`members[${i}].age`);
                        handleChange(e);
                      }}
                      onBlur={handleBlur}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Joining Date</Label>
                    <Input
                      type="date"
                      name={`members[${i}].dateOfJoining`}
                      value={m.dateOfJoining}
                      onChange={handleChange}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Sum Insured</Label>
                    <DropdownCombobox
                      value={m.sumInsured}
                      onChange={(v) => updateMember(i, { sumInsured: v })}
                      options={sumInsuredOptions}
                      placeholder="Select sum insured"
                      searchPlaceholder="Search amount"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Cumulative Bonus</Label>
                    <Input
                      name={`members[${i}].cumulativeBonus`}
                      value={m.cumulativeBonus}
                      onChange={handleChange}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Phone Number</Label>
                    <Input
                      name={`members[${i}].phNo`}
                      value={m.phNo}
                      onChange={handleChange}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Add ons</Label>
                    <Input
                      name={`members[${i}].addOnsAmount`}
                      value={m.addOnsAmount}
                      onChange={handleChange}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Basic Premium</Label>
                    <Input
                      name={`members[${i}].basicPremium`}
                      value={m.basicPremium}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      inputMode="decimal"
                      placeholder="e.g. 5000"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Remove Member</Label>
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="shrink-0"
                      onClick={() => removeMember(i)}
                      aria-label="Remove member"
                    >
                      <Minus className="size-4" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label>Gender</Label>
                    <DropdownCombobox
                      value={m.gender}
                      onChange={(v) => updateMember(i, { gender: v })}
                      options={genderOptions}
                      placeholder="Select gender"
                      searchPlaceholder="Search gender"
                    />
                  </div>
                </div>
              </div>
            ))}
            <FormikError name="members" errors={errors} touched={touched} submitCount={submitCount} />
            <Button type="button" variant="secondary" onClick={addMember} className="gap-1">
              <Plus className="size-4" />
              Add another member
            </Button>
          </CardContent>
        </Card>
        ) : null}

        {activeSection === "payment_bank_details" ? (
        <Card id="section-payment-bank-details">
          <CardHeader>
            <CardTitle>Payment &amp; Bank Details</CardTitle>
            <CardDescription>
              Mode of Payment, Transaction Number, Bank Name, Branch, Account Number, Name as per Cheque, IFSC Code,
              Not over, Transaction Date, Transaction Status, Dishonour Reason, Return Charges, Amount Received.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-3 sm:col-span-2 lg:col-span-4">
              <div className="flex items-center justify-between">
                <Label>Payment Transactions</Label>
                <Button type="button" size="sm" variant="outline" onClick={addPaymentTransaction}>
                  <Plus className="mr-1 size-4" /> Add Multiple Transaction
                </Button>
              </div>
              <div className="space-y-3">
                {values.paymentTransactions.map((transaction, index) => (
                  <div key={`txn-${index}`} className="rounded-md border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium">Transaction {index + 1}</span>
                      {values.paymentTransactions.length > 1 ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          onClick={() => removePaymentTransaction(index)}
                        >
                          <Minus className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <Label>Mode of Payment*</Label>
                        <DropdownCombobox
                          value={transaction.mode}
                          onChange={(v) =>
                            void setFieldValue(`paymentTransactions[${index}].mode`, v)
                          }
                          options={paymentModeOptions}
                          placeholder="Mode of Payment"
                          searchPlaceholder="Search mode"
                        />
                      </div>

                      {transaction.mode === "UPI" ? (
                        <div className="space-y-1">
                          <Label>Mobile Number</Label>
                          <Input
                            name={`paymentTransactions[${index}].mobileNumber`}
                            value={transaction.mobileNumber}
                            onChange={handleChange}
                          />
                        </div>
                      ) : null}

                      {transaction.mode !== "CASH" ? (
                        <div className="space-y-1">
                          <Label>Transaction Number</Label>
                          <Input
                            name={`paymentTransactions[${index}].transactionNumber`}
                            value={transaction.transactionNumber}
                            onChange={handleChange}
                          />
                        </div>
                      ) : null}

                      {(transaction.mode === "ONLINE" || transaction.mode === "CHEQUE") ? (
                        <>
                          <div className="space-y-1">
                            <Label>Bank Name</Label>
                            <Input
                              name={`paymentTransactions[${index}].bankName`}
                              value={transaction.bankName}
                              onChange={handleChange}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Branch</Label>
                            <Input
                              name={`paymentTransactions[${index}].branch`}
                              value={transaction.branch}
                              onChange={handleChange}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Account Number</Label>
                            <Input
                              name={`paymentTransactions[${index}].accountNumber`}
                              value={transaction.accountNumber}
                              onChange={handleChange}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Name as per Cheque</Label>
                            <Input
                              name={`paymentTransactions[${index}].nameAsPerCheque`}
                              value={transaction.nameAsPerCheque}
                              onChange={handleChange}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>IFSC Code</Label>
                            <Input
                              name={`paymentTransactions[${index}].ifscCode`}
                              value={transaction.ifscCode}
                              onChange={handleChange}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Not over</Label>
                            <Input
                              name={`paymentTransactions[${index}].notOver`}
                              value={transaction.notOver}
                              onChange={handleChange}
                            />
                          </div>
                        </>
                      ) : null}

                      <div className="space-y-1">
                        <Label>Transaction Date</Label>
                        <Input
                          type="date"
                          name={`paymentTransactions[${index}].transactionDate`}
                          value={transaction.transactionDate}
                          onChange={handleChange}
                        />
                      </div>

                      {(transaction.mode === "ONLINE" || transaction.mode === "CHEQUE") ? (
                        <div className="space-y-1">
                          <Label>Transaction Status</Label>
                          <DropdownCombobox
                            value={transaction.transactionStatus}
                            onChange={(v) =>
                              void setFieldValue(
                                `paymentTransactions[${index}].transactionStatus`,
                                v,
                              )
                            }
                            options={transactionStatusOptions}
                            placeholder="Transaction Status"
                            searchPlaceholder="Search status"
                          />
                        </div>
                      ) : null}

                      {(transaction.mode === "ONLINE" || transaction.mode === "CHEQUE") ? (
                        <>
                          <div className="space-y-1">
                            <Label>Dishonour Reason</Label>
                            <Input
                              name={`paymentTransactions[${index}].dishonourReason`}
                              value={transaction.dishonourReason}
                              onChange={handleChange}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Return Charges - (amount)</Label>
                            <Input
                              name={`paymentTransactions[${index}].returnCharges`}
                              value={transaction.returnCharges}
                              onChange={handleChange}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Other Charges</Label>
                            <Input
                              name={`paymentTransactions[${index}].otherCharges`}
                              value={transaction.otherCharges}
                              onChange={handleChange}
                            />
                          </div>
                        </>
                      ) : null}

                      <div className="space-y-1">
                        <Label>Amount Received</Label>
                        <Input
                          name={`paymentTransactions[${index}].amountReceived`}
                          value={transaction.amountReceived}
                          onChange={handleChange}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
        ) : null}

        {activeSection === "premium_details" ? (
        <Card id="section-premium-details">
          <CardHeader>
            <CardTitle>Premium Details</CardTitle>
            <CardDescription>Auto calculation with manual entry support.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Gross Premium</Label>
              <Input
                name="grossPremium"
                value={values.grossPremium}
                onChange={handlePremiumInput("grossPremium")}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Taxes - %</Label>
              <Input name="taxPercent" value={values.taxPercent} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>TAXES AMOUNT</Label>
              <Input name="taxAmount" value={values.taxAmount} onChange={handlePremiumInput("taxAmount")} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>SVKK Premium</Label>
              <Input
                name="svkkPremiumCalc"
                value={values.svkkPremiumCalc}
                onChange={handlePremiumInput("svkkPremiumCalc", ["vkkPremium"])}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Net Premium</Label>
              <Input
                name="coPremium"
                value={values.coPremium}
                onChange={handlePremiumInput("coPremium", ["netPremiumCalc"])}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Commission</Label>
              <Input name="commission" value={values.commission} onChange={handlePremiumInput("commission")} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>VKK Commission</Label>
              <Input
                name="vkkCommission"
                value={values.vkkCommission}
                onChange={handlePremiumInput("vkkCommission")}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Policy Holder Premium</Label>
              <Input
                name="policyHolderPremium"
                value={values.policyHolderPremium}
                onChange={handlePremiumInput("policyHolderPremium")}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Premium (1 Lakh Individual / 2 Lakh Floater)</Label>
              <Input
                name="twoLakhF"
                value={values.twoLakhF}
                onChange={handlePremiumInput("twoLakhF")}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Contribution (Gaam Mahajan / VKK)</Label>
              <Input
                name="contribution"
                value={values.contribution}
                onChange={handlePremiumInput("contribution")}
                onBlur={handleBlur}
              />
              <FormikError name="contribution" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <Label>Excess / Short Amount</Label>
              <Input
                name="excessShort"
                value={values.excessShort}
                onChange={handlePremiumInput("excessShort")}
                onBlur={handleBlur}
              />
              <FormikError name="excessShort" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <Label>Difference Amount Paid by Policyholder</Label>
              <Input
                name="differenceAmountPaidByHolder"
                value={values.differenceAmountPaidByHolder}
                onChange={handlePremiumInput("differenceAmountPaidByHolder", ["diffAmt"])}
                onBlur={handleBlur}
              />
              <FormikError
                name="differenceAmountPaidByHolder"
                errors={errors}
                touched={touched}
                submitCount={submitCount}
              />
            </div>
          </CardContent>
        </Card>
        ) : null}

        {activeSection === "loan_details" ? (
        <Card id="section-loan-details">
          <CardHeader>
            <CardTitle>Loan / CD / Refund</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="text-muted-foreground col-span-full text-xs font-medium uppercase tracking-wide">
              Loan
            </div>
            <div className="space-y-2">
              <Label>Loan Taken (Yes/No)</Label>
              <DropdownCombobox
                value={values.loanStatus}
                onChange={(v) => void setFieldValue("loanStatus", v)}
                options={yesNoOptions}
                placeholder="—"
                searchPlaceholder="Search"
              />
            </div>
            <div className="space-y-2">
              <Label>Loan Amount</Label>
              <Input name="loanAmt" value={values.loanAmt} onChange={handleChange} onBlur={handleBlur} />
            </div>

            <div className="text-muted-foreground col-span-full border-t pt-3 text-xs font-medium uppercase tracking-wide">
              CD
            </div>
            <div className="space-y-2">
              <Label>CD Account Used</Label>
              <DropdownCombobox
                value={values.cdAccountStatus}
                onChange={(v) => void setFieldValue("cdAccountStatus", v)}
                options={yesNoOptions}
                placeholder="—"
                searchPlaceholder="Search"
              />
            </div>
            <div className="space-y-2">
              <Label>CD Amount</Label>
              <Input name="cdAmount" value={values.cdAmount} onChange={handleChange} onBlur={handleBlur} />
            </div>

            <div className="text-muted-foreground col-span-full border-t pt-3 text-xs font-medium uppercase tracking-wide">
              Refund
            </div>
            <div className="space-y-2">
              <Label>Refund Cheque Amount</Label>
              <Input
                name="refundChequeAmt"
                value={values.refundChequeAmt}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Refund Cheque Number</Label>
              <Input
                name="refundChequeNo"
                value={values.refundChequeNo}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Refund Cheque Date</Label>
              <Input
                name="refundChequeDate"
                type="date"
                value={values.refundChequeDate}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
          </CardContent>
        </Card>
        ) : null}

        {activeSection === "nominee_details" ? (
        <Card id="section-nominee-details">
          <CardHeader>
            <CardTitle>Nominee Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nominee Name</Label>
              <Input
                name="nomineeName"
                value={values.nomineeName}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Nominee Relation</Label>
              <DropdownCombobox
                value={values.nomineeRelation}
                onChange={(v) => void setFieldValue("nomineeRelation", v)}
                options={relationOptions}
                placeholder="Select relation"
                searchPlaceholder="Search relation"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Nominee Phone number ( one number )</Label>
              <Input
                name="nomineePhoneNumber"
                value={values.nomineePhoneNumber}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
          </CardContent>
        </Card>
        ) : null}

        {activeSection === "address_contacts" ? (
        <Card id="section-address-contacts">
          <CardHeader>
            <CardTitle>Contact Details</CardTitle>
            <CardDescription>
              Address Line 1-4, Area, City, PIN Code, Primary/Secondary Mobile, WhatsApp Number, and Email ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2 lg:col-span-4">
              <Label>Address Line 1: House/Flat No, Building Name</Label>
              <Input name="address" value={values.address} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address Line 2: Street/Road Name</Label>
              <Input
                name="addressTwo"
                value={values.addressTwo}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address Line 3: Landmark / Locality</Label>
              <Input
                name="addressThree"
                value={values.addressThree}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address Line 4: Additional Details (optional)</Label>
              <Input
                name="addressFour"
                value={values.addressFour}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Area</RequiredLabel>
              <DropdownCombobox
                value={values.area}
                onChange={(v) => void setFieldValue("area", v)}
                options={areaOptions}
                placeholder="Select area"
                searchPlaceholder="Search area"
              />
              <FormikError name="area" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <DropdownCombobox
                value={values.city}
                onChange={(v) => void setFieldValue("city", v)}
                options={cityOptions}
                placeholder="Select city"
                searchPlaceholder="Search city"
              />
            </div>
            <div className="space-y-2">
              <Label>PIN Code</Label>
              <Input name="pincode" value={values.pincode} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>Primary Mobile Number</Label>
              <Input
                name="mobileFirst"
                value={values.mobileFirst}
                onChange={handleChange}
                onBlur={handleBlur}
                inputMode="tel"
                autoComplete="tel"
              />
              <FormikError name="mobileFirst" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <Label>Secondary Mobile Number</Label>
              <Input
                name="mobileSecond"
                value={values.mobileSecond}
                onChange={handleChange}
                onBlur={handleBlur}
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <div className="space-y-2">
              <RequiredLabel>WhatsApp Number</RequiredLabel>
              <Input
                name="whatsappNo"
                value={values.whatsappNo}
                onChange={handleChange}
                onBlur={handleBlur}
                inputMode="tel"
                autoComplete="off"
              />
              <FormikError name="whatsappNo" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <RequiredLabel>Email ID</RequiredLabel>
              <Input
                name="email"
                type="email"
                value={values.email}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
          </CardContent>
        </Card>
        ) : null}

        {activeSection === "courier" ? (
          <Card id="section-courier">
            <CardHeader>
              <CardTitle>Courier Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Courier Status (YES/NO)</Label>
                <DropdownCombobox
                  value={values.notCourier}
                  onChange={(v) => void setFieldValue("notCourier", v)}
                  options={yesNoOptions}
                  placeholder="—"
                  searchPlaceholder="Search"
                />
              </div>
              <div className="space-y-2">
                <Label>Courier Date</Label>
                <Input
                  name="courierDate"
                  type="date"
                  value={values.courierDate}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
              <div className="space-y-2">
                <Label>Courier Company</Label>
                <Input
                  name="courierCompany"
                  value={values.courierCompany}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
              <div className="space-y-2">
                <Label>POD Number</Label>
                <Input
                  name="podNumber"
                  value={values.podNumber}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                <Label>Courier Address</Label>
                <Input
                  name="courierAddress"
                  value={values.courierAddress}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "remark" ? (
          <Card id="section-remark">
            <CardHeader>
              <CardTitle>Remarks</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>General Remark</Label>
                <Input
                  name="generalRemark"
                  value={values.generalRemark}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
              <div className="space-y-2">
                <Label>Policy Change Remark</Label>
                <Input
                  name="policyChangeRemark"
                  value={values.policyChangeRemark}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          {isEdit || fetchedPolicyForUpdate ? (
            <Button type="submit" disabled={isBusy} className="min-w-40">
              {isBusy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Policy"
              )}
            </Button>
          ) : (
            <Button type="submit" disabled={isBusy} className="min-w-40">
              {isBusy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Policy + Auto Receipt"
            )}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={openReceiptPreviewFromForm}
            disabled={isBusy}
          >
            Generate Receipt Preview
          </Button>
        </div>
      </form>
      <Dialog
        open={receiptPreviewHtml != null}
        onOpenChange={(o) => {
          if (o) return;
          setReceiptPreviewHtml(null);
          if (navigateAfterReceiptClose) {
            const target = navigateAfterReceiptClose;
            setNavigateAfterReceiptClose(null);
            void router.push(target);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[min(96vw,1280px)] max-w-[min(96vw,1280px)] flex-col gap-4 overflow-hidden sm:max-w-[min(96vw,1280px)]">
          <DialogHeader>
            <DialogTitle>Receipt Preview</DialogTitle>
            <DialogDescription>
              {navigateAfterReceiptClose
                ? "Policy saved. Click Print to save the receipt as PDF, then Close to open the policy."
                : "Preview works with saved or unsaved policy data."}
            </DialogDescription>
          </DialogHeader>
          <div className="h-[68vh] overflow-hidden rounded border">
            <iframe title="Receipt Preview Frame" srcDoc={receiptPreviewHtml ?? ""} className="h-full w-full" />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setReceiptPreviewHtml(null);
                if (navigateAfterReceiptClose) {
                  const target = navigateAfterReceiptClose;
                  setNavigateAfterReceiptClose(null);
                  void router.push(target);
                }
              }}
            >
              {navigateAfterReceiptClose ? "Close & Open Policy" : "Close"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const filename = buildReceiptFilename([
                  "receipt",
                  values.svkkPublicId || values.policyNo,
                  values.year,
                ]);
                const tId = toast.loading("Preparing PDF…");
                try {
                  const ok = await downloadReceiptPreviewAsPdf(filename);
                  if (ok) {
                    toast.success("PDF downloaded", { id: tId });
                  } else {
                    toast.error("Could not generate PDF", { id: tId });
                  }
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "PDF failed", { id: tId });
                }
              }}
            >
              Save as PDF
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!printReceiptPreview()) {
                  toast.error("Receipt not ready to print");
                }
              }}
            >
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
