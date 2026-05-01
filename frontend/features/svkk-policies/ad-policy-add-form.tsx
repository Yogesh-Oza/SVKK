"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { svkkJson } from "@/lib/svkk/api";
import { canUploadPolicyDrive } from "@/lib/svkk/permissions";
import { FilePlus, FilePenLine, Loader2, Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormik } from "formik";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { emptyMemberRow } from "./ad-member-types";
import type { AdMemberRow } from "./ad-member-types";
import { AD_PRODUCT_OPTIONS, adProductFormValueFromApi } from "./ad-product-variant";
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
type CategoryItem = { id: string; key: string; name: string };
type PolicyGroupingOptionItem = { id: string; name: string };
type FiltersMeta = { policyGroupings?: string[] };
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
  | "remark"
  | "ref_no"
  | "receipt";
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
  { id: "address_contacts", label: "Address & Contacts", ref: "section-address-contacts" },
  { id: "premium_details", label: "Premium Details", ref: "section-premium-details" },
  { id: "payment_bank_details", label: "Payment & Bank Details", ref: "section-payment-bank-details" },
  { id: "nominee_details", label: "Nominee Details", ref: "section-nominee-details" },
  { id: "loan_details", label: "Loan Details", ref: "section-loan-details" },
  { id: "courier", label: "Courier", ref: "section-courier" },
  { id: "remark", label: "Remark", ref: "section-remark" },
  { id: "ref_no", label: "Ref No", ref: "section-ref-no" },
  { id: "receipt", label: "Receipt", ref: "section-receipt" },
];

function ageFromDob(iso: string): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) {
    a -= 1;
  }
  return a >= 0 ? String(a) : "";
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

const GENDERS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "O", label: "Other" },
];

const CHEQUE_STATUS = [
  { value: "none", label: "Select Cheque Status" },
  { value: "CLEARED", label: "CLEARED" },
  { value: "DISHONOURED", label: "DISHONOURED" },
] as const;

const YES_NO = [
  { value: "", label: "—" },
  { value: "YES", label: "YES" },
  { value: "NO", label: "NO" },
] as const;

const PAYMENT_MODES = [
  { value: "ONLINE", label: "Online transaction (UPI / NEFT ref.)" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH", label: "Cash" },
] as const;

const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
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
  const missingUrl = !getSvkkApiBase();
  const isEdit = Boolean(policyId);
  const canDriveUpload = user?.role ? canUploadPolicyDrive(user.role) : false;
  const canManageGroupings = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const [policyTypeId, setPolicyTypeId] = useState("");
  const [policyChartId, setPolicyChartId] = useState("");
  const [chartOpts, setChartOpts] = useState<ChartRow[]>([]);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<SvkkPolicyDetailForForm | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [fetchMode, setFetchMode] = useState<FetchMode>("fetch");
  const [fetchSvkkId, setFetchSvkkId] = useState("");
  const [fetchHolderName, setFetchHolderName] = useState("");
  const [fetchRows, setFetchRows] = useState<PolicyListRow[]>([]);
  const [selectedFetchId, setSelectedFetchId] = useState("");
  const [fetchBusy, setFetchBusy] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [fetchNotice, setFetchNotice] = useState<string | null>(null);
  const [fetchSuggestions, setFetchSuggestions] = useState<FetchSuggestion[]>([]);
  const [activeSection, setActiveSection] = useState<AddSectionId>("policy_details");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [policyGroupings, setPolicyGroupings] = useState<PolicyGroupingOptionItem[]>([]);
  const [newPolicyGroupingName, setNewPolicyGroupingName] = useState("");

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
    setChartOpts(charts);
    const h = charts.find((c) => c.chartKind === "COMBINED" || c.chartKind === "HOLDER");
    setPolicyChartId(h?.id ?? charts[0]?.id ?? "");
  }, []);

  const loadCategories = useCallback(async () => {
    const res = await svkkJson<{ items: CategoryItem[] }>("/categories");
    setCategories(res.items);
  }, []);

  const loadPolicyGroupings = useCallback(async () => {
    if (canManageGroupings) {
      const res = await svkkJson<{ items: PolicyGroupingOptionItem[] }>("/admin/policy-groupings");
      setPolicyGroupings(res.items);
      return;
    }
    const filters = await svkkJson<FiltersMeta>("/policies/filters");
    const items = (filters.policyGroupings ?? []).map((name) => ({ id: name, name }));
    setPolicyGroupings(items);
  }, [canManageGroupings]);

  const addPolicyGrouping = useCallback(async () => {
    const name = newPolicyGroupingName.trim();
    if (!name || !canManageGroupings) return;
    await svkkJson("/admin/policy-groupings", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setNewPolicyGroupingName("");
    await loadPolicyGroupings();
  }, [newPolicyGroupingName, canManageGroupings, loadPolicyGroupings]);

  const deletePolicyGrouping = useCallback(
    async (id: string) => {
      if (!canManageGroupings) return;
      await svkkJson(`/admin/policy-groupings/${id}`, { method: "DELETE" });
      await loadPolicyGroupings();
    },
    [canManageGroupings, loadPolicyGroupings],
  );

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

  const fetchPoliciesBySvkkId = useCallback(async (svkkIdOverride?: string) => {
    const svkkId = (svkkIdOverride ?? fetchSvkkId).trim();
    if (!svkkId) {
      setFetchNotice("Enter SVKK ID first.");
      return;
    }
    setFetchBusy(true);
    setFetchNotice(null);
    try {
      const query = new URLSearchParams({ search: svkkId, page: "1", pageSize: "50", sort: "createdAt" });
      const res = await svkkJson<{ items: PolicyListRow[] }>(`/policies?${query.toString()}`);
      const exactRows = (res.items ?? []).filter((item) => item.insuredParty.svkkPublicId === svkkId);
      setFetchRows(exactRows);
      const newest = exactRows[0];
      if (!newest) {
        setSelectedFetchId("");
        setFetchNotice("No policy records found for this SVKK ID.");
        return;
      }
      setSelectedFetchId(newest.id);
      setFetchHolderName(newest.insuredParty.name ?? "");
      await loadPolicyDetailIntoForm(newest.id, "Fetched old policy and copied all fields.");
    } catch (e) {
      setFetchNotice(e instanceof Error ? e.message : "Failed to fetch policies");
    } finally {
      setFetchBusy(false);
    }
  }, [fetchSvkkId, loadPolicyDetailIntoForm]);

  const loadFetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
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
    } catch {
      setFetchSuggestions([]);
    } finally {
      setSuggestBusy(false);
    }
  }, []);

  const selectFetchSuggestion = useCallback(
    async (suggestion: FetchSuggestion) => {
      setFetchSvkkId(suggestion.svkkPublicId);
      setFetchHolderName(suggestion.holderName);
      await fetchPoliciesBySvkkId(suggestion.svkkPublicId);
      setFetchSuggestions([]);
    },
    [fetchPoliciesBySvkkId],
  );

  const startNewPolicy = useCallback(async () => {
    await formik.setValues({
      ...getAdPolicyInitialValues(),
      svkkPublicId: fetchSvkkId.trim(),
      policyHolder: fetchHolderName.trim(),
      year: values.year,
      month: values.month,
    });
    setFetchMode("new");
    setFetchNotice("New policy started.");
  }, [formik, fetchSvkkId, fetchHolderName, values.year, values.month]);

  const carryForwardPolicy = useCallback(async () => {
    if (!selectedFetchId) {
      setFetchNotice("Select a prior-year policy first.");
      return;
    }
    await loadPolicyDetailIntoForm(selectedFetchId, "Carry Forward / Renew copied all prior fields.");
  }, [loadPolicyDetailIntoForm, selectedFetchId]);

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

  useEffect(() => {
    if (missingUrl || isEdit) {
      return;
    }
    void (async () => {
      setLoadErr(null);
      try {
        await Promise.all([loadAdPolicyType(), loadCategories(), loadPolicyGroupings()]);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Failed to load policy type");
      }
    })();
  }, [missingUrl, loadAdPolicyType, loadCategories, loadPolicyGroupings, isEdit]);

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
    if (isEdit || missingUrl) {
      return;
    }
    const query = fetchSvkkId.trim() || fetchHolderName.trim();
    if (query.length < 2) {
      setFetchSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      void loadFetchSuggestions(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [isEdit, missingUrl, fetchSvkkId, fetchHolderName, loadFetchSuggestions]);

  useEffect(() => {
    void setFieldValue("age", ageFromDob(values.dob));
  }, [values.dob, setFieldValue]);

  const updateMember = (i: number, patch: Partial<AdMemberRow>) => {
    const next = [...values.members];
    next[i] = { ...next[i]!, ...patch };
    if (patch.dob !== undefined) {
      next[i]!.age = ageFromDob(next[i]!.dob);
    }
    void setFieldValue("members", next);
  };

  const addMember = () => void setFieldValue("members", [...values.members, emptyMemberRow()]);
  const removeMember = (i: number) => {
    if (values.members.length <= 1) {
      return;
    }
    void setFieldValue(
      "members",
      values.members.filter((_, j) => j !== i),
    );
  };

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
                    onChange={(e) => setFetchSvkkId(e.target.value.toUpperCase())}
                    placeholder="Type SVKK ID"
                  />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Policy Holder</RequiredLabel>
                  <Input
                    value={fetchHolderName}
                    onChange={(e) => setFetchHolderName(e.target.value)}
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
                          className="hover:bg-muted flex items-center justify-between rounded border px-3 py-2 text-left text-sm"
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
                <Button type="button" onClick={() => void fetchPoliciesBySvkkId()} disabled={fetchBusy}>
                  {fetchBusy ? "Fetching..." : "Fetch Old Policy"}
                </Button>
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
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Policy + Auto Receipt"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void handleSubmit()}>
                    Update Policy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => toast.info("Preview is available after policy is saved.")}
                  >
                    Generate Receipt Preview
                  </Button>
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
                <RequiredLabel>SVKK ID</RequiredLabel>
                <Input
                  name="svkkPublicId"
                  value={values.svkkPublicId}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  autoComplete="off"
                />
                <FormikError name="svkkPublicId" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Customer ID</RequiredLabel>
                <Input
                  name="customerId"
                  value={values.customerId}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  autoComplete="off"
                />
                <FormikError name="customerId" errors={errors} touched={touched} submitCount={submitCount} />
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
                <FormikError name="adProduct" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Category</RequiredLabel>
                <Select
                  value={values.cat || "__none__"}
                  onValueChange={(v) => void setFieldValue("cat", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.key}>
                        {c.key} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormikError name="cat" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Month</RequiredLabel>
                <Select
                  value={values.month || "__none__"}
                  onValueChange={(v) => void setFieldValue("month", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select month</SelectItem>
                    {MONTH_OPTIONS.map((month) => (
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
                <Input name="year" value={values.year} onChange={handleChange} onBlur={handleBlur} placeholder="e.g. 2025-26" />
                <FormikError name="year" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Sum Insured (SI)</RequiredLabel>
                <Input name="sumInsured" value={values.sumInsured} onChange={handleChange} onBlur={handleBlur} />
                <FormikError name="sumInsured" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Person</RequiredLabel>
                <Input name="person" value={values.person} onChange={handleChange} onBlur={handleBlur} placeholder="e.g. 2" />
                <FormikError name="person" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Village</RequiredLabel>
                <Input name="village" value={values.village} onChange={handleChange} onBlur={handleBlur} />
                <FormikError name="village" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Area</RequiredLabel>
                <Input name="area" value={values.area} onChange={handleChange} onBlur={handleBlur} />
                <FormikError name="area" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <RequiredLabel>Grouping</RequiredLabel>
                <Select
                  value={values.policyGrouping || "none"}
                  onValueChange={(v) => void setFieldValue("policyGrouping", v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Policy Grouping</SelectItem>
                    {policyGroupings.map((g) => (
                      <SelectItem key={g.id} value={g.name}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormikError name="policyGrouping" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              {canManageGroupings ? (
                <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                  <Label>Manage Grouping Options</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={newPolicyGroupingName}
                      onChange={(e) => setNewPolicyGroupingName(e.target.value)}
                      placeholder="Add grouping option"
                      className="max-w-xs"
                    />
                    <Button type="button" variant="outline" onClick={() => void addPolicyGrouping()}>
                      Add
                    </Button>
                    {policyGroupings.map((g) => (
                      <Button
                        key={`del-${g.id}`}
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void deletePolicyGrouping(g.id)}
                      >
                        {g.name} ×
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Policy End Date</Label>
                <Input name="policyEnd" type="date" value={values.policyEnd} onChange={handleChange} onBlur={handleBlur} />
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
              <CardDescription>Holder name, DOB, PAN, and relationship.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 sm:col-span-2">
                <RequiredLabel>Policy Holder Name</RequiredLabel>
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
                <RequiredLabel htmlFor={`${idPrefix}-dob`}>Holder DOB</RequiredLabel>
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
                <Label>Holder Gender</Label>
                <p className="text-muted-foreground text-xs">Not saved to server yet; use for office records only.</p>
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
                <RequiredLabel htmlFor={`${idPrefix}-pan`}>PAN</RequiredLabel>
                <Input
                  id={`${idPrefix}-pan`}
                  name="panNo"
                  value={values.panNo}
                  onChange={(e) => void setFieldValue("panNo", e.target.value.toUpperCase())}
                  onBlur={handleBlur}
                  maxLength={10}
                  autoComplete="off"
                />
                <FormikError name="panNo" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
              <div className="space-y-2">
                <Label>Relationship</Label>
                <Input name="relation" value={values.relation} onChange={handleChange} onBlur={handleBlur} />
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
            <CardTitle>Insured members</CardTitle>
            <CardDescription>Per-member sum insured, bonus, and premium</CardDescription>
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
                    <Label>Name</Label>
                    <Input
                      name={`members[${i}].name`}
                      value={m.name}
                      onChange={handleChange}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Relationship</Label>
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
                    <Label>DOB</Label>
                    <Input
                      type="date"
                      name={`members[${i}].dob`}
                      value={m.dob}
                      onChange={(e) => {
                        const d = e.target.value;
                        void setFieldValue(`members[${i}].dob`, d);
                        void setFieldValue(`members[${i}].age`, ageFromDob(d));
                      }}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Age</Label>
                    <Input name={`members[${i}].age`} value={m.age} readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-1">
                    <Label>Date of Joining</Label>
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
                    <Label>Phone</Label>
                    <Input
                      name={`members[${i}].phNo`}
                      value={m.phNo}
                      onChange={handleChange}
                      onBlur={handleBlur}
                    />
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
                  <div className="space-y-1 lg:col-span-2">
                    <Label>Basic Premium</Label>
                    <div className="flex gap-2">
                      <Input
                        name={`members[${i}].basicPremium`}
                        value={m.basicPremium}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className="flex-1"
                      />
                      {values.members.length > 1 ? (
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
                      ) : null}
                    </div>
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
            <CardDescription>Mode of payment, transaction / cheque, and bank fields.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2 lg:col-span-4">
              <RequiredLabel>Mode of Payment</RequiredLabel>
              <Select
                value={values.paymentMode}
                onValueChange={(v) => void setFieldValue("paymentMode", v as AdPolicyFormValues["paymentMode"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormikError name="paymentMode" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            {values.paymentMode === "ONLINE" ? (
              <div className="space-y-2 sm:col-span-2">
                <RequiredLabel>Transaction Detail (UTR / ref.)</RequiredLabel>
                <Input
                  name="onlineTransactionRef"
                  value={values.onlineTransactionRef}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  autoComplete="off"
                />
                <FormikError
                  name="onlineTransactionRef"
                  errors={errors}
                  touched={touched}
                  submitCount={submitCount}
                />
              </div>
            ) : null}
            {values.paymentMode === "CHEQUE" ? (
              <>
                <div className="space-y-2">
                  <RequiredLabel>Policy cheque no</RequiredLabel>
                  <Input
                    name="policyChequeNo"
                    value={values.policyChequeNo}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  <FormikError name="policyChequeNo" errors={errors} touched={touched} submitCount={submitCount} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Bank name</RequiredLabel>
                  <Input name="bank" value={values.bank} onChange={handleChange} onBlur={handleBlur} />
                  <FormikError name="bank" errors={errors} touched={touched} submitCount={submitCount} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Account no</RequiredLabel>
                  <Input
                    name="accountNo"
                    value={values.accountNo}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  <FormikError name="accountNo" errors={errors} touched={touched} submitCount={submitCount} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Branch</RequiredLabel>
                  <Input name="branch" value={values.branch} onChange={handleChange} onBlur={handleBlur} />
                  <FormikError name="branch" errors={errors} touched={touched} submitCount={submitCount} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <RequiredLabel>Name as per cheque</RequiredLabel>
                  <Input
                    name="nameAsPerCheque"
                    value={values.nameAsPerCheque}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  <FormikError name="nameAsPerCheque" errors={errors} touched={touched} submitCount={submitCount} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>IFSC</RequiredLabel>
                  <Input
                    name="ifsc"
                    value={values.ifsc}
                    onChange={(e) => void setFieldValue("ifsc", e.target.value.toUpperCase())}
                    onBlur={handleBlur}
                  />
                  <FormikError name="ifsc" errors={errors} touched={touched} submitCount={submitCount} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Not over</RequiredLabel>
                  <Input
                    name="notOver"
                    value={values.notOver}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  <FormikError name="notOver" errors={errors} touched={touched} submitCount={submitCount} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Date of Payment / CHQ Date</RequiredLabel>
                  <Input
                    name="chequeDate"
                    type="date"
                    value={values.chequeDate}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  <FormikError name="chequeDate" errors={errors} touched={touched} submitCount={submitCount} />
                </div>
                <div className="space-y-2">
                  <RequiredLabel>Cheque Cleared / Dishonoured</RequiredLabel>
                  <Select
                    value={values.chequeStatus || "none"}
                    onValueChange={(v) => void setFieldValue("chequeStatus", v === "none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHEQUE_STATUS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormikError name="chequeStatus" errors={errors} touched={touched} submitCount={submitCount} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Return charges / reason</Label>
                  <Input
                    name="reasonDishonoured"
                    value={values.reasonDishonoured}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  <FormikError
                    name="reasonDishonoured"
                    errors={errors}
                    touched={touched}
                    submitCount={submitCount}
                  />
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
        ) : null}

        {activeSection === "premium_details" ? (
        <Card id="section-premium-details">
          <CardHeader>
            <CardTitle>Premium Details</CardTitle>
            <CardDescription>VKK premium, net/gross, commission, and holder adjustments.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <RequiredLabel>VKK Premium</RequiredLabel>
              <Input
                name="vkkPremium"
                value={values.vkkPremium}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <FormikError name="vkkPremium" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Net Premium</RequiredLabel>
              <Input name="coPremium" value={values.coPremium} onChange={handleChange} onBlur={handleBlur} />
              <FormikError name="coPremium" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <Label>Gross Premium</Label>
              <Input
                name="grossPremium"
                value={values.grossPremium}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Discount (Gross − Net)</Label>
              <Input
                readOnly
                className="bg-muted"
                value={
                  parseInr(values.grossPremium) > 0 && parseInr(values.coPremium) > 0
                    ? formatInr(Math.max(parseInr(values.grossPremium) - parseInr(values.coPremium), 0))
                    : ""
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Commission</Label>
              <Input
                name="commission"
                value={values.commission}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Premium 1 Lac ind / 2 Lac floater</Label>
              <Input name="twoLakhF" value={values.twoLakhF} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>Policy Holder Premium</Label>
              <Input
                name="policyHolderPremium"
                value={values.policyHolderPremium}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Gaam Mahajan / VKK Refund</Label>
              <Input
                name="gaamMahajan"
                value={values.gaamMahajan}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Excess / Short Amt</Label>
              <Input
                name="excessShort"
                value={values.excessShort}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Diff. Amt Paid by Policy Holder</Label>
              <Input name="diffAmt" value={values.diffAmt} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>Cumulative Bonus (Holder)</Label>
              <Input
                name="comulativeBonus"
                value={values.comulativeBonus}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Joining Year</Label>
              <Input name="joiningYear" value={values.joiningYear} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>Basic Premium (Holder)</Label>
              <Input
                name="basicPremiumPs"
                value={values.basicPremiumPs}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
          </CardContent>
        </Card>
        ) : null}

        {activeSection === "loan_details" ? (
        <Card id="section-loan-details">
          <CardHeader>
            <CardTitle>Loan Details</CardTitle>
            <CardDescription>LOAN NO and NOT OVER fields added as requested.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>LOAN NO</Label>
              <Input
                name="loanNo"
                value={values.loanNo}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Enter loan number"
              />
            </div>
            <div className="space-y-2">
              <Label>NOT OVER</Label>
              <Input
                name="notOver"
                value={values.notOver}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Enter not-over amount/text"
              />
            </div>
            <div className="space-y-2">
              <Label>Loan Taken</Label>
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
              <RequiredLabel>Nominee Name</RequiredLabel>
              <Input
                name="nomineeName"
                value={values.nomineeName}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <FormikError name="nomineeName" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <RequiredLabel>Nominee Relation</RequiredLabel>
              <Input
                name="nomineeRelation"
                value={values.nomineeRelation}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <FormikError
                name="nomineeRelation"
                errors={errors}
                touched={touched}
                submitCount={submitCount}
              />
            </div>
          </CardContent>
        </Card>
        ) : null}

        {activeSection === "address_contacts" ? (
        <Card id="section-address-contacts">
          <CardHeader>
            <CardTitle>Address &amp; Contacts</CardTitle>
            <CardDescription>Address lines, city, PIN, mobile, WhatsApp, and email.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2 lg:col-span-4">
              <RequiredLabel>Address</RequiredLabel>
              <Input name="address" value={values.address} onChange={handleChange} onBlur={handleBlur} />
              <FormikError name="address" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <RequiredLabel>Address two</RequiredLabel>
              <Input
                name="addressTwo"
                value={values.addressTwo}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <FormikError name="addressTwo" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <RequiredLabel>Address three</RequiredLabel>
              <Input
                name="addressThree"
                value={values.addressThree}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <FormikError name="addressThree" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <RequiredLabel>Address four</RequiredLabel>
              <Input
                name="addressFour"
                value={values.addressFour}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <FormikError name="addressFour" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>City</RequiredLabel>
              <Input name="city" value={values.city} onChange={handleChange} onBlur={handleBlur} />
              <FormikError name="city" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Pin code</RequiredLabel>
              <Input name="pincode" value={values.pincode} onChange={handleChange} onBlur={handleBlur} />
              <FormikError name="pincode" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Primary mobile</RequiredLabel>
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
              <RequiredLabel>Secondary mobile</RequiredLabel>
              <Input
                name="mobileSecond"
                value={values.mobileSecond}
                onChange={handleChange}
                onBlur={handleBlur}
                inputMode="tel"
                autoComplete="tel"
              />
              <FormikError name="mobileSecond" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>WhatsApp no.</RequiredLabel>
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
              <Label>Email</Label>
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
              <CardTitle>Courier</CardTitle>
              <CardDescription>Dispatch status; refund / CD kept here for the same office workflow as the HTML prototype.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Courier (YES/NO)</Label>
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
              <div className="space-y-2 sm:col-span-2 lg:col-span-4">
                <Label>Address for Courier / POD Notes</Label>
                <Input
                  name="courierAddress"
                  value={values.courierAddress}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Address, company, POD reference…"
                />
              </div>
              <div className="text-muted-foreground col-span-full border-t pt-3 text-xs font-medium uppercase tracking-wide">
                Refund &amp; CD
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
                <Label>Refund Cheque No</Label>
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
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "remark" ? (
          <Card id="section-remark">
            <CardHeader>
              <CardTitle>Remark</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <RequiredLabel>Remark</RequiredLabel>
                <Input name="remark" value={values.remark} onChange={handleChange} onBlur={handleBlur} />
                <FormikError name="remark" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "ref_no" ? (
          <Card id="section-ref-no">
            <CardHeader>
              <CardTitle>Ref No</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-md">
                <RequiredLabel>Reference No</RequiredLabel>
                <Input
                  name="refNo"
                  value={values.refNo}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className="border-primary font-mono"
                />
                <FormikError name="refNo" errors={errors} touched={touched} submitCount={submitCount} />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {activeSection === "receipt" ? (
          <Card id="section-receipt">
            <CardHeader>
              <CardTitle>Receipt</CardTitle>
              <CardDescription>Receipt number is issued after save; period is edited under Policy Details.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Receipt No</Label>
                <Input readOnly className="bg-muted" value={isEdit && policyId ? "Use policy receipts from detail page" : "—"} />
              </div>
              <div className="space-y-2">
                <Label>Period (read-only)</Label>
                <Input
                  readOnly
                  className="bg-muted"
                  value={[values.month, values.year].filter(Boolean).join(" · ") || "—"}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex justify-end border-t pt-4">
          <Button type="submit" disabled={isSubmitting} className="min-w-40">
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isEdit ? (
              "Save changes"
            ) : (
              "Submit"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
