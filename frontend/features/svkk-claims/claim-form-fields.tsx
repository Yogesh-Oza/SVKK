"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PolicyDateInput } from "@/features/svkk-policies/policy-date-input";

import type { ClaimEditFormValues } from "./claim-edit-form";

const CLAIM_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">
        {label}
        {hint ? <span className="text-muted-foreground font-normal"> · {hint}</span> : null}
      </Label>
      {children}
    </div>
  );
}

export type ClaimFormFieldsProps = {
  form: ClaimEditFormValues;
  onChange: (key: keyof ClaimEditFormValues, value: string) => void;
  mode: "create" | "edit";
  claimNo?: string;
  onClaimNoChange?: (value: string) => void;
};

export function ClaimFormFields({
  form,
  onChange,
  mode,
  claimNo,
  onClaimNoChange,
}: ClaimFormFieldsProps) {
  const set = (key: keyof ClaimEditFormValues) => (value: string) => onChange(key, value);
  const required = mode === "create";

  return (
    <div className="space-y-6">
      <Section title="Identifiers">
        {mode === "create" ? (
          <Field label="Claim # *" className="sm:col-span-2">
            <Input value={claimNo ?? ""} onChange={(e) => onClaimNoChange?.(e.target.value)} />
          </Field>
        ) : null}
        <Field label={required ? "SVKK ID *" : "SVKK ID"}>
          <Input value={form.svkkPublicId} onChange={(e) => set("svkkPublicId")(e.target.value)} />
        </Field>
        <Field label={required ? "Policy year *" : "Policy year"}>
          <Input value={form.policyYear} onChange={(e) => set("policyYear")(e.target.value)} />
        </Field>
        <Field label="Village">
          <Input value={form.village} onChange={(e) => set("village")(e.target.value)} />
        </Field>
        <Field label="MD ID">
          <Input value={form.mdId} onChange={(e) => set("mdId")(e.target.value)} />
        </Field>
        <Field label="Category">
          <Input value={form.categoryText} onChange={(e) => set("categoryText")(e.target.value)} />
        </Field>
      </Section>

      <Section title="Policy">
        <Field label="Policy holder">
          <Input value={form.policyHolderName} onChange={(e) => set("policyHolderName")(e.target.value)} />
        </Field>
        <Field label="Policy type">
          <Input value={form.policyTypeText} onChange={(e) => set("policyTypeText")(e.target.value)} />
        </Field>
        <Field label="Policy number" hint="CSV snapshot">
          <Input value={form.policyNoText} onChange={(e) => set("policyNoText")(e.target.value)} />
        </Field>
        <Field label="Policy grouping" hint="CSV snapshot">
          <Input
            value={form.policyGroupingText}
            onChange={(e) => set("policyGroupingText")(e.target.value)}
          />
        </Field>
        <Field label="Policy start">
          <PolicyDateInput value={form.policyStartDate} onValueChange={set("policyStartDate")} />
        </Field>
        <Field label="Policy end">
          <PolicyDateInput value={form.policyEndDate} onValueChange={set("policyEndDate")} />
        </Field>
        <Field label="Sum insured (INR)">
          <Input
            value={form.sumInsured}
            onChange={(e) => set("sumInsured")(e.target.value)}
            inputMode="decimal"
          />
        </Field>
      </Section>

      <Section title="Patient">
        <Field label="Patient name">
          <Input value={form.patientName} onChange={(e) => set("patientName")(e.target.value)} />
        </Field>
        <Field label="Age">
          <Input
            value={form.patientAge}
            onChange={(e) => set("patientAge")(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Relation">
          <Input value={form.patientRelation} onChange={(e) => set("patientRelation")(e.target.value)} />
        </Field>
        <Field label="Gender">
          <Input value={form.patientGender} onChange={(e) => set("patientGender")(e.target.value)} />
        </Field>
      </Section>

      <Section title="Claim & amounts">
        <Field label="Claim lodge type">
          <Input value={form.claimType} onChange={(e) => set("claimType")(e.target.value)} />
        </Field>
        <Field label="Actual lodge type">
          <Input value={form.actualLodgeType} onChange={(e) => set("actualLodgeType")(e.target.value)} />
        </Field>
        <Field label="Treatment type">
          <Input value={form.treatmentType} onChange={(e) => set("treatmentType")(e.target.value)} />
        </Field>
        <Field label="Treatment procedure" hint="CSV: Treatment  Type">
          <Input
            value={form.treatmentProcedure}
            onChange={(e) => set("treatmentProcedure")(e.target.value)}
          />
        </Field>
        <Field label="Disease category" className="sm:col-span-2">
          <Input value={form.diseaseCategory} onChange={(e) => set("diseaseCategory")(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={form.status} onValueChange={set("status")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLAIM_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status text" hint="CSV import label">
          <Input value={form.statusText} onChange={(e) => set("statusText")(e.target.value)} />
        </Field>
        <Field label="Claim lodge amount (INR)">
          <Input
            value={form.claimAmount}
            onChange={(e) => set("claimAmount")(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Reported lodge amount (INR)">
          <Input
            value={form.reportedLodgeAmount}
            onChange={(e) => set("reportedLodgeAmount")(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Paid amount (INR)" hint="CSV: Paid Amount">
          <Input
            value={form.approvedAmount}
            onChange={(e) => set("approvedAmount")(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Deduction amount (INR)">
          <Input
            value={form.deductionAmount}
            onChange={(e) => set("deductionAmount")(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Discount amount (INR)">
          <Input
            value={form.discountAmount}
            onChange={(e) => set("discountAmount")(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Balance sum insured (INR)">
          <Input
            value={form.balanceSumInsured}
            onChange={(e) => set("balanceSumInsured")(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Deduction details" className="sm:col-span-2">
          <Textarea
            value={form.deductionDetails}
            onChange={(e) => set("deductionDetails")(e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="Remark" className="sm:col-span-2">
          <Textarea value={form.remark} onChange={(e) => set("remark")(e.target.value)} rows={2} />
        </Field>
      </Section>

      <Section title="TPA & insurer">
        <Field label="TPA name">
          <Input value={form.tpaName} onChange={(e) => set("tpaName")(e.target.value)} />
        </Field>
        <Field label="Insurance company">
          <Input
            value={form.insuranceCompany}
            onChange={(e) => set("insuranceCompany")(e.target.value)}
          />
        </Field>
        <Field label="D.O. branch">
          <Input value={form.doBranch} onChange={(e) => set("doBranch")(e.target.value)} />
        </Field>
      </Section>

      <Section title="Dates">
        <Field label="Claim received">
          <PolicyDateInput value={form.claimReceivedDate} onValueChange={set("claimReceivedDate")} />
        </Field>
        <Field label="Information raised">
          <PolicyDateInput
            value={form.informationRaisedDate}
            onValueChange={set("informationRaisedDate")}
          />
        </Field>
        <Field label="Information received">
          <PolicyDateInput
            value={form.informationReceivedDate}
            onValueChange={set("informationReceivedDate")}
          />
        </Field>
        <Field label="Admission">
          <PolicyDateInput value={form.admissionDate} onValueChange={set("admissionDate")} />
        </Field>
        <Field label="Discharge">
          <PolicyDateInput value={form.dischargeDate} onValueChange={set("dischargeDate")} />
        </Field>
        <Field label="Claim lodge date">
          <PolicyDateInput value={form.lodgeDate} onValueChange={set("lodgeDate")} />
        </Field>
      </Section>

      <Section title="Hospital">
        <Field label="Hospital name">
          <Input value={form.hospitalName} onChange={(e) => set("hospitalName")(e.target.value)} />
        </Field>
        <Field label="Hospital area">
          <Input value={form.hospitalArea} onChange={(e) => set("hospitalArea")(e.target.value)} />
        </Field>
        <Field label="Network / non-network">
          <Input value={form.networkType} onChange={(e) => set("networkType")(e.target.value)} />
        </Field>
        <Field label="Hospital in PPN (Y/N)">
          <Select
            value={form.hospitalInPpn || "_"}
            onValueChange={(v) => set("hospitalInPpn")(v === "_" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">—</SelectItem>
              <SelectItem value="Y">Yes</SelectItem>
              <SelectItem value="N">No</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Room category">
          <Input value={form.roomCategory} onChange={(e) => set("roomCategory")(e.target.value)} />
        </Field>
      </Section>

      <Section title="Clinical & payment">
        <Field label="Diagnosis / illness" className="sm:col-span-2">
          <Textarea value={form.illness} onChange={(e) => set("illness")(e.target.value)} rows={2} />
        </Field>
        <Field label="Denied reasons" className="sm:col-span-2">
          <Textarea
            value={form.deniedReasons}
            onChange={(e) => set("deniedReasons")(e.target.value)}
            rows={2}
          />
        </Field>
        <Field label="Payment in favour of">
          <Input
            value={form.paymentInFavourOf}
            onChange={(e) => set("paymentInFavourOf")(e.target.value)}
          />
        </Field>
        <Field label="Payment date">
          <PolicyDateInput value={form.paymentDate} onValueChange={set("paymentDate")} />
        </Field>
        <Field label="PRS / CRS date">
          <PolicyDateInput value={form.prsCrsDate} onValueChange={set("prsCrsDate")} />
        </Field>
        <Field label="Payment details" className="sm:col-span-2">
          <Textarea
            value={form.paymentDetails}
            onChange={(e) => set("paymentDetails")(e.target.value)}
            rows={2}
          />
        </Field>
      </Section>
    </div>
  );
}
