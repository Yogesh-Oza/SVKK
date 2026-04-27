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
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import { FilePlus, Loader2, Minus, Plus, ArrowLeft, Calculator } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormik } from "formik";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { emptyMemberRow } from "./ad-member-types";
import type { AdMemberRow } from "./ad-member-types";
import { AD_PRODUCT_OPTIONS } from "./ad-product-variant";
import { FormikError, RequiredLabel } from "./ad-policy-form-controls";
import { getAdPolicyInitialValues, type AdPolicyFormValues } from "./ad-policy-form-values";
import { adPolicyValidationSchema } from "./ad-policy-validation-schema";
import { submitAdPolicyRequest } from "./ad-policy-submit";
import type { PolicyGrouping } from "./ad-policy-types";

export type { AdMemberRow } from "./ad-member-types";

type ChartRow = { id: string; version: number; chartKind: string };
type PolicyTypeRow = { id: string; key: string; name: string };

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

const GROUPING: { value: "" | PolicyGrouping; label: string }[] = [
  { value: "", label: "Policy Grouping" },
  { value: "SVKK", label: "SVKK" },
  { value: "NVKK", label: "NVKK" },
  { value: "RTY", label: "RTY" },
  { value: "OTHER", label: "OTHER" },
];

const PAYMENT_MODES = [
  { value: "ONLINE", label: "Online transaction (UPI / NEFT ref.)" },
  { value: "CHEQUE", label: "Cheque" },
] as const;

export function AdPolicyAddForm() {
  const router = useRouter();
  const idPrefix = useId();
  const idemKeyRef = useRef(crypto.randomUUID());
  const missingUrl = !getSvkkApiBase();

  const [policyTypeId, setPolicyTypeId] = useState("");
  const [policyChartId, setPolicyChartId] = useState("");
  const [chartOpts, setChartOpts] = useState<ChartRow[]>([]);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const formik = useFormik<AdPolicyFormValues>({
    initialValues: getAdPolicyInitialValues(),
    validationSchema: adPolicyValidationSchema,
    validateOnBlur: true,
    validateOnChange: true,
    onSubmit: async (values) => {
      setApiErr(null);
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

  useEffect(() => {
    if (missingUrl) {
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
  }, [missingUrl, loadAdPolicyType]);

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
  if (loadErr) {
    return <p className="text-destructive text-sm">{loadErr}</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10 select-text">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <FilePlus className="text-primary size-6" />
            <h1 className="text-2xl font-semibold">Add AD policy</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Full data entry for the AD product (Family Floater / Individual / Asha Kiran). Premium
            calculator is a separate page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/calculator" className="gap-1">
              <Calculator className="size-4" />
              Premium calculator
            </Link>
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/policies" className="gap-1">
              <ArrowLeft className="size-4" />
              Policies
            </Link>
          </Button>
        </div>
      </div>

      {policyChartId ? (
        <p className="text-muted-foreground text-xs">
          Active rate chart: v
          {chartOpts.find((c) => c.id === policyChartId)?.version} —{" "}
          {chartOpts.find((c) => c.id === policyChartId)?.chartKind}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6 select-text" noValidate>
        {apiErr ? <p className="text-destructive text-sm">{apiErr}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Personal info</CardTitle>
            <CardDescription>Policy, holder, and first-year coverage</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Policy number</Label>
              <Input name="policyNo" value={values.policyNo} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Policy type (AD)</RequiredLabel>
              <Select
                value={values.adProduct}
                onValueChange={(v) => {
                  void setFieldValue("adProduct", v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
            <div className="space-y-2 sm:col-span-2">
              <RequiredLabel>Policy holder name</RequiredLabel>
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
              <Label>Insurance company</Label>
              <Input name="company" value={values.company} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>TPA</Label>
              <Input name="tpa" value={values.tpa} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>Policy start</Label>
              <Input
                name="policyStart"
                type="date"
                value={values.policyStart}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Policy expiry</Label>
              <Input
                name="policyEnd"
                type="date"
                value={values.policyEnd}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Village</RequiredLabel>
              <Input name="village" value={values.village} onChange={handleChange} onBlur={handleBlur} />
              <FormikError name="village" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Category</RequiredLabel>
              <Input name="cat" value={values.cat} onChange={handleChange} onBlur={handleBlur} />
              <FormikError name="cat" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel htmlFor={`${idPrefix}-dob`}>Date of birth (holder)</RequiredLabel>
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
              <Label>Age</Label>
              <Input name="age" value={values.age} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Input name="relation" value={values.relation} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>No. of persons insured</RequiredLabel>
              <Input
                name="person"
                value={values.person}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g. 2"
              />
              <FormikError name="person" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Sum insured (₹)</RequiredLabel>
              <Input
                name="sumInsured"
                value={values.sumInsured}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <FormikError name="sumInsured" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <Label>Cumulative bonus (holder)</Label>
              <Input
                name="comulativeBonus"
                value={values.comulativeBonus}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Joining year</Label>
              <Input
                name="joiningYear"
                value={values.joiningYear}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Basic premium (holder)</Label>
              <Input
                name="basicPremiumPs"
                value={values.basicPremiumPs}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
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
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    placeholder="Name"
                    name={`members[${i}].name`}
                    value={m.name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  <Input
                    placeholder="Relationship"
                    name={`members[${i}].relationship`}
                    value={m.relationship}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
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
                  <Input placeholder="Age" name={`members[${i}].age`} value={m.age} readOnly className="bg-muted" />
                  <Input
                    type="date"
                    name={`members[${i}].dateOfJoining`}
                    value={m.dateOfJoining}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  <Input
                    placeholder="Sum insured"
                    name={`members[${i}].sumInsured`}
                    value={m.sumInsured}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  <Input
                    placeholder="Cumulative bonus"
                    name={`members[${i}].cumulativeBonus`}
                    value={m.cumulativeBonus}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  <Input
                    placeholder="Phone"
                    name={`members[${i}].phNo`}
                    value={m.phNo}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
                  <div className="flex gap-2 lg:col-span-2">
                    <Select
                      value={m.gender}
                      onValueChange={(v) => updateMember(i, { gender: v })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Gender" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Basic premium"
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
            ))}
            <FormikError name="members" errors={errors} touched={touched} submitCount={submitCount} />
            <Button type="button" variant="secondary" onClick={addMember} className="gap-1">
              <Plus className="size-4" />
              Add another member
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mode of payment & bank</CardTitle>
            <CardDescription>Online (UTR) or cheque details for the first-year premium</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <RequiredLabel>Mode of payment</RequiredLabel>
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
                <RequiredLabel>Online transaction / UTR</RequiredLabel>
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
                  <RequiredLabel>Cheque date</RequiredLabel>
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
                  <RequiredLabel>Cheque status</RequiredLabel>
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
                  <Label>Reason for dishonoured</Label>
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

        <Card>
          <CardHeader>
            <CardTitle>Premiums & commission</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <RequiredLabel>SVKK / VKK premium</RequiredLabel>
              <Input
                name="vkkPremium"
                value={values.vkkPremium}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <FormikError name="vkkPremium" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Net premium</RequiredLabel>
              <Input name="coPremium" value={values.coPremium} onChange={handleChange} onBlur={handleBlur} />
              <FormikError name="coPremium" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <Label>Gross premium</Label>
              <Input
                name="grossPremium"
                value={values.grossPremium}
                onChange={handleChange}
                onBlur={handleBlur}
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
              <Label>1 Lac ind / 2 Lac floater</Label>
              <Input name="twoLakhF" value={values.twoLakhF} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2">
              <Label>Policy holder premium</Label>
              <Input
                name="policyHolderPremium"
                value={values.policyHolderPremium}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Gaam Mahajan / VKK contribution</Label>
              <Input
                name="gaamMahajan"
                value={values.gaamMahajan}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Excess / short amount</Label>
              <Input
                name="excessShort"
                value={values.excessShort}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Diff. amount paid by policyholder</Label>
              <Input name="diffAmt" value={values.diffAmt} onChange={handleChange} onBlur={handleBlur} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Loan & nominee</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Loan taken</Label>
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
              <Label>Loan amount</Label>
              <Input name="loanAmt" value={values.loanAmt} onChange={handleChange} onBlur={handleBlur} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <RequiredLabel>Nominee name</RequiredLabel>
              <Input
                name="nomineeName"
                value={values.nomineeName}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <FormikError name="nomineeName" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Nominee relation</RequiredLabel>
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

        <Card>
          <CardHeader>
            <CardTitle>Address & contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-3">
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
              <RequiredLabel>Area</RequiredLabel>
              <Input name="area" value={values.area} onChange={handleChange} onBlur={handleBlur} />
              <FormikError name="area" errors={errors} touched={touched} submitCount={submitCount} />
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

        <Card>
          <CardHeader>
            <CardTitle>Refund, CD, courier, meta</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Refund cheque amount</Label>
              <Input
                name="refundChequeAmt"
                value={values.refundChequeAmt}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Refund cheque no</Label>
              <Input
                name="refundChequeNo"
                value={values.refundChequeNo}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Refund cheque date</Label>
              <Input
                name="refundChequeDate"
                type="date"
                value={values.refundChequeDate}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>CD account used</Label>
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
              <Label>CD amount</Label>
              <Input
                name="cdAmount"
                value={values.cdAmount}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2">
              <Label>Courier status (YES/NO)</Label>
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
              <Label>Courier date</Label>
              <Input
                name="courierDate"
                type="date"
                value={values.courierDate}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address for courier</Label>
              <Input
                name="courierAddress"
                value={values.courierAddress}
                onChange={handleChange}
                onBlur={handleBlur}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <RequiredLabel>Remark</RequiredLabel>
              <Input
                name="remark"
                value={values.remark}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <FormikError name="remark" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Reference no</RequiredLabel>
              <Input
                name="refNo"
                value={values.refNo}
                onChange={handleChange}
                onBlur={handleBlur}
                className="border-primary"
              />
              <FormikError name="refNo" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Year</RequiredLabel>
              <Input name="year" value={values.year} onChange={handleChange} onBlur={handleBlur} />
              <FormikError name="year" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Month</RequiredLabel>
              <Input name="month" value={values.month} onChange={handleChange} onBlur={handleBlur} />
              <FormikError name="month" errors={errors} touched={touched} submitCount={submitCount} />
            </div>
            <div className="space-y-2">
              <RequiredLabel>Policy grouping</RequiredLabel>
              <Select
                value={values.policyGrouping || "none"}
                onValueChange={(v) =>
                  void setFieldValue("policyGrouping", (v === "none" ? "" : v) as "" | PolicyGrouping)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUPING.map((g) => (
                    <SelectItem key={g.value || "n"} value={g.value || "none"}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormikError
                name="policyGrouping"
                errors={errors}
                touched={touched}
                submitCount={submitCount}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Policy URL</Label>
              <Input name="url" value={values.url} onChange={handleChange} onBlur={handleBlur} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting} className="min-w-40">
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Submit"}
          </Button>
        </div>
      </form>
    </div>
  );
}
