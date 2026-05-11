"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { POLICY_PERIOD_MONTH_LABELS_CALENDAR_ORDER } from "@/lib/svkk/policy-period-months";
import { svkkJson } from "@/lib/svkk/api";
import { canUploadPolicyDrive } from "@/lib/svkk/permissions";
import { buildReceiptDocumentHtml, type PolicyDetailForReceipt } from "@/lib/svkk/policy-receipt-print";
import { FilePlus, FilePenLine, Loader2, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormik } from "formik";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { emptyMemberRow } from "./ad-member-types";
import type { AdMemberRow } from "./ad-member-types";
import { AD_PRODUCT_OPTIONS, adProductFormValueFromApi, toAdProductVariant } from "./ad-product-variant";
import { FormikError, RequiredLabel } from "./ad-policy-form-controls";
import { getAdPolicyInitialValues, type AdPolicyFormValues } from "./ad-policy-form-values";
import { adPolicyValidationSchema } from "./ad-policy-validation-schema";
import { submitAdPolicyPatchRequest, submitAdPolicyRequest } from "./ad-policy-submit";
import {
  policyDetailToAdFormValues,
  type SvkkPolicyDetailForForm,
} from "./ad-policy-detail-to-form";
import { PolicyDriveUploadButton } from "./policy-drive-upload";

export type { AdMemberRow } from "./ad-member-types";

type ChartRow = { id: string; version: number; chartKind: string };
type PolicyTypeRow = { id: string; key: string; name: string };
type FetchMode = "fetch" | "new";
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

const GENDERS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "O", label: "Other" },
];


const YES_NO = [
  { value: "", label: "—" },
  { value: "YES", label: "YES" },
  { value: "NO", label: "NO" },
] as const;

const RELATIONSHIP_OPTIONS = [
  "Self",
  "Spouse",
  "Son",
  "Daughter",
  "Father",
  "Mother",
  "Brother",
  "Sister",
  "Grandfather",
  "Grandmother",
  "Father-in-law",
  "Mother-in-law",
  "Other",
] as const;

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
  const lastAutoIdKeyRef = useRef("");
  const svkkSeqRef = useRef("");
  const refSeqRef = useRef("");
  const missingUrl = !getSvkkApiBase();
  const isEdit = Boolean(policyId);
  const canDriveUpload = user?.role ? canUploadPolicyDrive(user.role) : false;

  const [policyTypeId, setPolicyTypeId] = useState("");
  const [policyChartId, setPolicyChartId] = useState("");
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<SvkkPolicyDetailForForm | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [fetchMode, setFetchMode] = useState<FetchMode>("fetch");
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

  const initialValues = useMemo(() => {
    if (isEdit && detail) {
      return policyDetailToAdFormValues(detail);
    }
    return getAdPolicyInitialValues();
  }, [isEdit, detail]);

  const formik = useFormik<AdPolicyFormValues>({
    initialValues,
    enableReinitialize: true,
    validationSchema: adPolicyValidationSchema,
    validateOnBlur: true,
    validateOnChange: true,
    onSubmit: async (values) => {
      setApiErr(null);
      if (isEdit && policyId && detail) {
        const y = detail.years.find((yy) => yy.yearLabel === editYearLabel) ?? detail.years[0];
        if (!y) {
          setApiErr("This policy has no year row to update.");
          return;
        }
        try {
          await submitAdPolicyPatchRequest({
            policyId,
            values,
            expectedUpdatedAt: detail.updatedAt,
            yearLabel: y.yearLabel,
          });
          void router.push(`/policies/${policyId}`);
        } catch (e) {
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
        void router.push(`/policies/${id}`);
      } catch (e) {
        setApiErr(e instanceof Error ? e.message : "Create failed");
      }
    },
  });

  const { values, errors, touched, handleSubmit, handleChange, handleBlur, setFieldValue, isSubmitting, submitCount } =
    formik;
  const [premiumManual, setPremiumManual] = useState<Record<string, boolean>>({});

  const markPremiumManual = useCallback((field: string) => {
    setPremiumManual((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
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

  const summary = useMemo(() => {
    const holderBasic = parseInr(values.basicPremiumPs);
    const membersBasic = values.members.reduce((total, row) => total + parseInr(row.basicPremium), 0);
    const basic = holderBasic + membersBasic;
    const gross = parseInr(values.grossPremium);
    const net = parseInr(values.coPremium);
    const discount = gross > 0 && net > 0 ? Math.max(gross - net, 0) : 0;
    return { basic, rider: 0, gross, discount, net };
  }, [values.basicPremiumPs, values.members, values.grossPremium, values.coPremium]);

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
        await formik.setValues(nextValues);
        setFetchMode("fetch");
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
      const search = new URLSearchParams({ search: query.trim(), page: "1", pageSize: "25", sort: "createdAt" });
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
    const query = new URLSearchParams({ search: svkkId, page: "1", pageSize: "50", sort: "createdAt" });
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

  const startNewPolicy = useCallback(async () => {
    await formik.setValues({
      ...getAdPolicyInitialValues(),
      policyHolder: fetchHolderName.trim(),
      year: values.year,
      month: values.month,
      policyGrouping: values.policyGroup,
    });
    lastAutoIdKeyRef.current = "";
    svkkSeqRef.current = "";
    refSeqRef.current = "";
    setFetchMode("new");
    setFetchNotice("New policy started. Fill Policy Group + Month to auto-generate SVKK ID and Reference No.");
  }, [formik, fetchHolderName, values.year, values.month, values.policyGroup]);

  const carryForwardPolicy = useCallback(async () => {
    if (!selectedFetchId) {
      setFetchNotice("Select a prior-year policy first.");
      return;
    }
    const row = await svkkJson<SvkkPolicyDetailForForm>(`/policies/${selectedFetchId}`);
    const carriedValues = policyDetailToAdFormValues(row);
    const shiftedYear = nextYearLabel(carriedValues.year);
    let nextReferenceNo = carriedValues.refNo;
    try {
      const generated = await requestAutoIds(carriedValues.policyGroup, carriedValues.month, shiftedYear);
      nextReferenceNo = generated.referenceNo || nextReferenceNo;
    } catch {
      // keep existing reference if generator fails
    }
    await formik.setValues({
      ...carriedValues,
      year: shiftedYear,
      previousPolicyNo: carriedValues.policyNo,
      previousEndDate: carriedValues.policyEnd,
      policyNo: "",
      policyStart: "",
      policyEnd: "",
      refNo: nextReferenceNo,
    });
    setFetchMode("fetch");
    setFetchNotice("Carry Forward / Renew copied all prior fields.");
  }, [formik, requestAutoIds, selectedFetchId]);

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

  const resetFetchedPolicyState = useCallback(async () => {
    await formik.setValues(getAdPolicyInitialValues());
    setFetchMode("fetch");
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
    const remarksCombined = [values.generalRemark, values.policyChangeRemark]
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
      periodYearText: values.year.trim() || null,
      periodMonthText: values.month.trim() || null,
      insuredParty: {
        name: values.policyHolder.trim() || "Policy Holder",
        svkkPublicId: values.svkkPublicId.trim() || "—",
        customerId: values.customerId.trim() || null,
        pan: values.panNo.trim() || null,
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
                  },
                ]
              : [],
        },
      ],
    };
    setReceiptPreviewHtml(buildReceiptDocumentHtml(payload, { embedded: true }));
  }, [policyId, values]);

  useEffect(() => {
    if (missingUrl || isEdit) {
      return;
    }
    void (async () => {
      setLoadErr(null);
      try {
        await loadAdPolicyType();
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Failed to load policy type");
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
    if (isEdit || selectedFetchId) {
      return;
    }
    const group = values.policyGroup.trim();
    const month = values.month.trim();
    const year = values.year.trim();
    if (!group || !month) {
      lastAutoIdKeyRef.current = "";
      svkkSeqRef.current = "";
      refSeqRef.current = "";
      if (values.svkkPublicId) void setFieldValue("svkkPublicId", "");
      if (values.refNo) void setFieldValue("refNo", "");
      return;
    }
    const key = `${group}|${month}|${year}`;
    if (lastAutoIdKeyRef.current === key) {
      return;
    }
    lastAutoIdKeyRef.current = key;
    if (svkkSeqRef.current && refSeqRef.current) {
      const composed = composeIdsFromSeq(group, month, year, svkkSeqRef.current, refSeqRef.current);
      void setFieldValue("svkkPublicId", composed.svkkPublicId.toUpperCase());
      void setFieldValue("refNo", composed.referenceNo.toUpperCase());
      return;
    }
    void (async () => {
      try {
        const generated = await requestAutoIds(group, month, year);
        svkkSeqRef.current = generated.svkkSeq || "";
        refSeqRef.current = generated.refSeq || "";
        void setFieldValue("svkkPublicId", (generated.svkkPublicId || "").toUpperCase());
        void setFieldValue("refNo", (generated.referenceNo || "").toUpperCase());
      } catch {
        // keep manual editing possible if generator fails
      }
    })();
  }, [isEdit, requestAutoIds, selectedFetchId, setFieldValue, values]);

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
    void setFieldValue("age", ageFromDobOnAnchor(values.dob, ageAnchorDate));
  }, [values.dob, ageAnchorDate, setFieldValue]);

  useEffect(() => {
    if (!values.members.length) {
      return;
    }
    const next = values.members.map((member) => ({
      ...member,
      age: ageFromDobOnAnchor(member.dob, ageAnchorDate),
    }));
    const changed = next.some((member, index) => member.age !== values.members[index]?.age);
    if (changed) {
      void setFieldValue("members", next);
    }
  }, [ageAnchorDate, setFieldValue, values.members]);

  const updateMember = (i: number, patch: Partial<AdMemberRow>) => {
    const next = [...values.members];
    next[i] = { ...next[i]!, ...patch };
    if (patch.dob !== undefined) {
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
  }, [values.person, setFieldValue]);

  useEffect(() => {
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
  }, [premiumManual, setFieldValue, values]);

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

      <form onSubmit={handleSubmit} className="space-y-6 select-text" noValidate>
        {apiErr ? <p className="text-destructive text-sm">{apiErr}</p> : null}

        {!isEdit ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Add Policy</span>
                <span className="text-muted-foreground text-xs font-medium">
                  {fetchMode === "new" ? "New Policy" : "Fetch Mode"}
                </span>
              </CardTitle>
              <CardDescription>Fetch old policy by SVKK ID, carry forward all fields, or start new.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <RequiredLabel>SVKK ID</RequiredLabel>
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
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void startNewPolicy()}>
                  New Policy
                </Button>
                <Button type="button" variant="outline" onClick={() => void carryForwardPolicy()}>
                  Carry Forward / Renew
                </Button>
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
                  <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Basic Premium</p><p className="font-semibold">₹ {formatInr(summary.basic)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Rider</p><p className="font-semibold">₹ {formatInr(summary.rider)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Gross</p><p className="font-semibold">₹ {formatInr(summary.gross)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Discount</p><p className="font-semibold">₹ {formatInr(summary.discount)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-muted-foreground text-xs">Net Premium</p><p className="font-semibold">₹ {formatInr(summary.net)}</p></CardContent></Card>
                </div>
                <div className="overflow-x-auto rounded border">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Person</th>
                        <th className="p-2 text-left">Role</th>
                        <th className="p-2 text-left">Age</th>
                        <th className="p-2 text-left">Basic</th>
                        <th className="p-2 text-left">Rider</th>
                        <th className="p-2 text-left">Discount</th>
                        <th className="p-2 text-left">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="p-2">{values.policyHolder || "Holder"}</td>
                        <td className="p-2">holder</td>
                        <td className="p-2">{values.age || "—"}</td>
                        <td className="p-2">{parseInr(values.basicPremiumPs) > 0 ? `₹ ${formatInr(parseInr(values.basicPremiumPs))}` : "Age could not be calculated."}</td>
                        <td className="p-2">—</td>
                        <td className="p-2">—</td>
                        <td className="p-2">—</td>
                      </tr>
                      {values.members.map((member, index) => (
                        <tr key={`${member.name}-${index}`} className="border-t">
                          <td className="p-2">{member.name || `Member ${index + 1}`}</td>
                          <td className="p-2">member</td>
                          <td className="p-2">{member.age || "—"}</td>
                          <td className="p-2">{parseInr(member.basicPremium) > 0 ? `₹ ${formatInr(parseInr(member.basicPremium))}` : "Age could not be calculated."}</td>
                          <td className="p-2">—</td>
                          <td className="p-2">—</td>
                          <td className="p-2">—</td>
                        </tr>
                      ))}
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
              <CardDescription>SVKK ID, policy identifiers, coverage period, and grouping (legacy layout).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>SVKK ID</Label>
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
                <Label>Policy Type</Label>
                <Select
                  value={values.adProduct || "__none__"}
                  onValueChange={(v) => void setFieldValue("adProduct", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
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
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={values.cat || "__none__"}
                  onValueChange={(v) => void setFieldValue("cat", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select category</SelectItem>
                    {POLICY_CATEGORY_OPTIONS.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Month</Label>
                <Select
                  value={values.month || "__none__"}
                  onValueChange={(v) => void setFieldValue("month", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
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
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
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
              </div>
              <div className="space-y-2">
                <Label>Sum Insured (SI)</Label>
                <Input name="sumInsured" value={values.sumInsured} onChange={handleChange} onBlur={handleBlur} />
              </div>
              <div className="space-y-2">
                <Label>Person</Label>
                <Input name="person" value={values.person} onChange={handleChange} onBlur={handleBlur} placeholder="e.g. 2" />
              </div>
              <div className="space-y-2">
                <Label>Village</Label>
                <Input name="village" value={values.village} onChange={handleChange} onBlur={handleBlur} />
              </div>
              <div className="space-y-2">
                <Label>Area</Label>
                <Input name="area" value={values.area} onChange={handleChange} onBlur={handleBlur} />
              </div>
              <div className="space-y-2">
                <Label>Policy End Date</Label>
                <Input name="policyEnd" type="date" value={values.policyEnd} onChange={handleChange} onBlur={handleBlur} />
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
                <Select
                  value={values.policyGroup || "__none__"}
                  onValueChange={(v) => void setFieldValue("policyGroup", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select policy group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select policy group</SelectItem>
                    <SelectItem value="SVKK">SVKK</SelectItem>
                    <SelectItem value="NVKK">NVKK</SelectItem>
                    <SelectItem value="RTY">RTY</SelectItem>
                    <SelectItem value="OTHER">OTHER</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Policy Start</Label>
                <Input name="policyStart" type="date" value={values.policyStart} onChange={handleChange} onBlur={handleBlur} />
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
                <Label>Reference No</Label>
                <Input name="refNo" value={values.refNo} onChange={handleChange} onBlur={handleBlur} />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                <Label>Policy URL</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    name="url"
                    value={values.url}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="min-w-0 flex-1"
                  />
                  {canDriveUpload && !missingUrl ? (
                    <PolicyDriveUploadButton
                      policyId={isEdit ? policyId : undefined}
                      expectedUpdatedAt={isEdit && detail ? detail.updatedAt : undefined}
                      onUploaded={(url, meta) => {
                        void setFieldValue("url", url);
                        if (isEdit && detail && meta?.updatedAt) {
                          setDetail((d) => (d ? { ...d, updatedAt: meta.updatedAt!, policyUrl: url } : d));
                        }
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "policy_holder_details" ? (
          <Card id="section-policy-holder-details">
            <CardHeader>
              <CardTitle>Policy Holder Details</CardTitle>
              <CardDescription>
                Holder Name, PAN, Village, DOB, Age (auto from policy expiry), Relationship, Joining Date, Gender, Add-ons.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Holder Name</Label>
                <Input
                  name="policyHolder"
                  value={values.policyHolder}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  autoComplete="name"
                />
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
                <Label>Village</Label>
                <Input name="village" value={values.village} onChange={handleChange} onBlur={handleBlur} />
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
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select
                  value={values.holderGender ? values.holderGender : "__none__"}
                  onValueChange={(v) => void setFieldValue("holderGender", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {GENDERS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Relationship</Label>
                <Input name="relation" value={values.relation} onChange={handleChange} onBlur={handleBlur} />
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
                <Input name="age" value={values.age} readOnly className="bg-muted" />
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
                    <Select
                      value={m.relationship || "__none__"}
                      onValueChange={(v) => updateMember(i, { relationship: v === "__none__" ? "" : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select relationship" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select relationship</SelectItem>
                        {RELATIONSHIP_OPTIONS.map((rel) => (
                          <SelectItem key={rel} value={rel}>
                            {rel}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                        void setFieldValue(`members[${i}].age`, ageFromDobOnAnchor(d, ageAnchorDate));
                      }}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Age</Label>
                    <Input name={`members[${i}].age`} value={m.age} readOnly className="bg-muted" />
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
                    <Input
                      name={`members[${i}].sumInsured`}
                      value={m.sumInsured}
                      onChange={handleChange}
                      onBlur={handleBlur}
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
                    <Select value={m.gender} onValueChange={(v) => updateMember(i, { gender: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                        <Select
                          value={transaction.mode}
                          onValueChange={(v) => void setFieldValue(`paymentTransactions[${index}].mode`, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Mode of Payment" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ONLINE">Online</SelectItem>
                            <SelectItem value="CHEQUE">Cheque</SelectItem>
                            <SelectItem value="CASH">Cash</SelectItem>
                            <SelectItem value="NEFT">NEFT</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Transaction Number</Label>
                        <Input
                          name={`paymentTransactions[${index}].transactionNumber`}
                          value={transaction.transactionNumber}
                          onChange={handleChange}
                        />
                      </div>
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
                      <div className="space-y-1">
                        <Label>Transaction Date</Label>
                        <Input
                          type="date"
                          name={`paymentTransactions[${index}].transactionDate`}
                          value={transaction.transactionDate}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Transaction Status</Label>
                        <Select
                          value={transaction.transactionStatus || "__none__"}
                          onValueChange={(v) =>
                            void setFieldValue(
                              `paymentTransactions[${index}].transactionStatus`,
                              v === "__none__" ? "" : v,
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Transaction Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Status Pending</SelectItem>
                            <SelectItem value="CLEARED">Cleared</SelectItem>
                            <SelectItem value="DISHONOURED">Dishonoured</SelectItem>
                            <SelectItem value="PENDING">Pending</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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
              <Input name="twoLakhF" value={values.twoLakhF} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>Contribution (Gaam Mahajan / VKK)</Label>
              <Input
                name="contribution"
                value={values.contribution}
                onChange={handlePremiumInput("contribution")}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Excess / Short Amount</Label>
              <Input
                name="excessShort"
                value={values.excessShort}
                onChange={handlePremiumInput("excessShort")}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Difference Amount Paid by Policyholder</Label>
              <Input
                name="differenceAmountPaidByHolder"
                value={values.differenceAmountPaidByHolder}
                onChange={handlePremiumInput("differenceAmountPaidByHolder", ["diffAmt"])}
                onBlur={handleBlur}
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
              <Select
                value={values.loanStatus || "none"}
                onValueChange={(v) => void setFieldValue("loanStatus", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {YES_NO.map((o) => (
                    <SelectItem key={o.value || "n"} value={o.value || "none"}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Select
                value={values.cdAccountStatus || "none"}
                onValueChange={(v) => void setFieldValue("cdAccountStatus", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YES_NO.map((o) => (
                    <SelectItem key={`cd-${o.value}`} value={o.value || "none"}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Input
                name="nomineeRelation"
                value={values.nomineeRelation}
                onChange={handleChange}
                onBlur={handleBlur}
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
              <Label>Area</Label>
              <Input name="area" value={values.area} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input name="city" value={values.city} onChange={handleChange} onBlur={handleBlur} />
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
                <Select
                  value={values.notCourier || "none"}
                  onValueChange={(v) => void setFieldValue("notCourier", v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YES_NO.map((o) => (
                      <SelectItem key={`cr-${o.value}`} value={o.value || "none"}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          <Button type="submit" disabled={isSubmitting} className="min-w-40">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Policy + Auto Receipt"
            )}
          </Button>
          {isEdit ? (
            <Button type="button" variant="outline" onClick={() => void handleSubmit()} disabled={isSubmitting}>
              Update Policy
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={openReceiptPreviewFromForm}
            disabled={isSubmitting}
          >
            Generate Receipt Preview
          </Button>
        </div>
      </form>
      <Dialog open={receiptPreviewHtml != null} onOpenChange={(o) => !o && setReceiptPreviewHtml(null)}>
        <DialogContent className="flex max-h-[90vh] w-[min(96vw,1280px)] max-w-[min(96vw,1280px)] flex-col gap-4 overflow-hidden sm:max-w-[min(96vw,1280px)]">
          <DialogHeader>
            <DialogTitle>Receipt Preview</DialogTitle>
            <DialogDescription>Preview works with saved or unsaved policy data.</DialogDescription>
          </DialogHeader>
          <div className="h-[68vh] overflow-hidden rounded border">
            <iframe title="Receipt Preview Frame" srcDoc={receiptPreviewHtml ?? ""} className="h-full w-full" />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setReceiptPreviewHtml(null)}>
              Close
            </Button>
            <Button
              type="button"
              onClick={() => {
                const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Receipt Preview Frame"]');
                frame?.contentWindow?.focus();
                frame?.contentWindow?.print();
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
