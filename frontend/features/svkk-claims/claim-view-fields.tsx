"use client";

import type { ClaimEditFormValues } from "./claim-edit-form";
import {
  CategoryBadge,
  formatInrRupee,
  LodgeTypeBadge,
  StatusBadge,
} from "./claim-register-badges";

function display(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  return t || "—";
}

function ppnLabel(raw: string): string {
  if (raw === "Y") return "Yes";
  if (raw === "N") return "No";
  return "—";
}

function Cell({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2 xl:col-span-2" : undefined}>
      <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm leading-snug break-words">{children}</dd>
    </div>
  );
}

function Panel({
  title,
  children,
  dense,
}: {
  title: string;
  children: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <section className="bg-muted/20 rounded-lg border p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <dl
        className={
          dense
            ? "grid grid-cols-2 gap-x-5 gap-y-3"
            : "grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-3 xl:grid-cols-4"
        }
      >
        {children}
      </dl>
    </section>
  );
}

export function ClaimViewFields({
  form,
  claimNo,
}: {
  form: ClaimEditFormValues;
  claimNo: string;
}) {
  return (
    <div className="space-y-4">
      <Panel title="Identifiers">
        <Cell label="Claim #">
          <span className="font-mono">{display(claimNo)}</span>
        </Cell>
        <Cell label="SVKK ID">
          <span className="font-mono">{display(form.svkkPublicId)}</span>
        </Cell>
        <Cell label="MD ID">
          <span className="font-mono">{display(form.mdId)}</span>
        </Cell>
        <Cell label="Policy year">{display(form.policyYear)}</Cell>
        <Cell label="Village">{display(form.village)}</Cell>
        <Cell label="Category">
          <CategoryBadge value={form.categoryText || null} />
        </Cell>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Policy" dense>
          <Cell label="Policy holder" wide>
            {display(form.policyHolderName)}
          </Cell>
          <Cell label="Policy number">
            <span className="font-mono">{display(form.policyNoText)}</span>
          </Cell>
          <Cell label="Policy type">{display(form.policyTypeText)}</Cell>
          <Cell label="Grouping">{display(form.policyGroupingText)}</Cell>
          <Cell label="Start">{display(form.policyStartDate)}</Cell>
          <Cell label="End">{display(form.policyEndDate)}</Cell>
          <Cell label="Sum insured">{formatInrRupee(form.sumInsured)}</Cell>
        </Panel>

        <Panel title="Patient" dense>
          <Cell label="Patient name" wide>
            {display(form.patientName)}
          </Cell>
          <Cell label="Age">{display(form.patientAge)}</Cell>
          <Cell label="Relation">{display(form.patientRelation)}</Cell>
          <Cell label="Gender">{display(form.patientGender)}</Cell>
        </Panel>
      </div>

      <Panel title="Claim & amounts">
        <Cell label="Lodge type">
          <LodgeTypeBadge value={form.claimType} />
        </Cell>
        <Cell label="Actual lodge type">
          <LodgeTypeBadge value={form.actualLodgeType} />
        </Cell>
        <Cell label="Status">
          <StatusBadge value={form.statusText || form.status} />
        </Cell>
        <Cell label="Status text">{display(form.statusText)}</Cell>
        <Cell label="Lodge amount">{formatInrRupee(form.claimAmount)}</Cell>
        <Cell label="Reported lodge">{formatInrRupee(form.reportedLodgeAmount)}</Cell>
        <Cell label="Paid amount">{formatInrRupee(form.approvedAmount)}</Cell>
        <Cell label="Deduction">{formatInrRupee(form.deductionAmount)}</Cell>
        <Cell label="Discount">{formatInrRupee(form.discountAmount)}</Cell>
        <Cell label="Balance SI">{formatInrRupee(form.balanceSumInsured)}</Cell>
        <Cell label="Treatment type">{display(form.treatmentType)}</Cell>
        <Cell label="Treatment procedure">{display(form.treatmentProcedure)}</Cell>
        <Cell label="Disease category" wide>
          {display(form.diseaseCategory)}
        </Cell>
        <Cell label="Deduction details" wide>
          {display(form.deductionDetails)}
        </Cell>
        <Cell label="Remark" wide>
          {display(form.remark)}
        </Cell>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Hospital" dense>
          <Cell label="Hospital" wide>
            {display(form.hospitalName)}
          </Cell>
          <Cell label="Area">{display(form.hospitalArea)}</Cell>
          <Cell label="Network">{display(form.networkType)}</Cell>
          <Cell label="PPN">{ppnLabel(form.hospitalInPpn)}</Cell>
          <Cell label="Room category">{display(form.roomCategory)}</Cell>
        </Panel>

        <Panel title="TPA & insurer" dense>
          <Cell label="TPA">{display(form.tpaName)}</Cell>
          <Cell label="Insurer" wide>
            {display(form.insuranceCompany)}
          </Cell>
          <Cell label="D.O. branch">{display(form.doBranch)}</Cell>
        </Panel>
      </div>

      <Panel title="Dates">
        <Cell label="Admission">{display(form.admissionDate)}</Cell>
        <Cell label="Discharge">{display(form.dischargeDate)}</Cell>
        <Cell label="Lodge date">{display(form.lodgeDate)}</Cell>
        <Cell label="Claim received">{display(form.claimReceivedDate)}</Cell>
        <Cell label="Info raised">{display(form.informationRaisedDate)}</Cell>
        <Cell label="Info received">{display(form.informationReceivedDate)}</Cell>
        <Cell label="Payment date">{display(form.paymentDate)}</Cell>
        <Cell label="PRS / CRS">{display(form.prsCrsDate)}</Cell>
      </Panel>

      <Panel title="Clinical & payment">
        <Cell label="Diagnosis / illness" wide>
          {display(form.illness)}
        </Cell>
        <Cell label="Denied reasons" wide>
          {display(form.deniedReasons)}
        </Cell>
        <Cell label="Payment in favour of">{display(form.paymentInFavourOf)}</Cell>
        <Cell label="Payment details" wide>
          {display(form.paymentDetails)}
        </Cell>
      </Panel>
    </div>
  );
}
