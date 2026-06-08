"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { svkkJson } from "@/lib/svkk/api";

import type { ClaimDetail } from "./claim-detail-types";
import {
  claimDetailToForm,
  emptyClaimEditForm,
  formToClaimPatch,
  type ClaimEditFormValues,
} from "./claim-edit-form";

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
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

type ClaimEditDialogProps = {
  claimId: string | null;
  claimNo?: string | null;
  onClose: () => void;
  onSaved: (detail: ClaimDetail) => void;
};

export function ClaimEditDialog({ claimId, claimNo, onClose, onSaved }: ClaimEditDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<{ claimNo: string; policyNo: string } | null>(null);
  const [form, setForm] = useState<ClaimEditFormValues>(emptyClaimEditForm);

  useEffect(() => {
    if (!claimId) {
      setMeta(null);
      setForm(emptyClaimEditForm());
      return;
    }
    let cancelled = false;
    setLoading(true);
    void svkkJson<ClaimDetail>(`/claims/${claimId}`)
      .then((detail) => {
        if (cancelled) return;
        setMeta({
          claimNo: detail.claimNo,
          policyNo: detail.policy?.policyNo ?? "—",
        });
        setForm(claimDetailToForm(detail));
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Failed to load claim");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [claimId, onClose]);

  const set =
    (key: keyof ClaimEditFormValues) => (value: string) =>
      setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSave() {
    if (!claimId) return;
    const parsed = formToClaimPatch(form);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    setSaving(true);
    try {
      const updated = await svkkJson<ClaimDetail>(`/claims/${claimId}`, {
        method: "PATCH",
        body: JSON.stringify(parsed.body),
      });
      toast.success("Claim updated");
      onSaved(updated);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!claimId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Edit claim details</DialogTitle>
          <DialogDescription>
            Update all claim fields imported from CSV. Claim number cannot be changed.
            {meta ? (
              <span className="mt-1 block font-mono text-xs">
                {meta.claimNo}
                {meta.policyNo !== "—" ? ` · Policy ${meta.policyNo}` : ""}
              </span>
            ) : claimNo ? (
              <span className="mt-1 block font-mono text-xs">{claimNo}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading claim…
            </div>
          ) : (
            <div className="space-y-6">
              <Section title="Identifiers">
                <Field label="SVKK ID">
                  <Input value={form.svkkPublicId} onChange={(e) => set("svkkPublicId")(e.target.value)} />
                </Field>
                <Field label="Policy year">
                  <Input value={form.policyYear} onChange={(e) => set("policyYear")(e.target.value)} />
                </Field>
                <Field label="Village">
                  <Input value={form.village} onChange={(e) => set("village")(e.target.value)} />
                </Field>
              </Section>

              <Section title="Policy">
                <Field label="Policy holder">
                  <Input
                    value={form.policyHolderName}
                    onChange={(e) => set("policyHolderName")(e.target.value)}
                  />
                </Field>
                <Field label="Policy type">
                  <Input value={form.policyTypeText} onChange={(e) => set("policyTypeText")(e.target.value)} />
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
                <Field label="Claim type">
                  <Input value={form.claimType} onChange={(e) => set("claimType")(e.target.value)} />
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
                <Field label="Status text (import label)">
                  <Input value={form.statusText} onChange={(e) => set("statusText")(e.target.value)} />
                </Field>
                <Field label="Claim amount (INR)">
                  <Input
                    value={form.claimAmount}
                    onChange={(e) => set("claimAmount")(e.target.value)}
                    inputMode="decimal"
                  />
                </Field>
                <Field label="Approved amount (INR)">
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
                  <Select value={form.hospitalInPpn || "_"} onValueChange={(v) => set("hospitalInPpn")(v === "_" ? "" : v)}>
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
                <Field label="Illness" className="sm:col-span-2">
                  <Textarea value={form.illness} onChange={(e) => set("illness")(e.target.value)} rows={2} />
                </Field>
                <Field label="Denied reasons" className="sm:col-span-2">
                  <Textarea
                    value={form.deniedReasons}
                    onChange={(e) => set("deniedReasons")(e.target.value)}
                    rows={2}
                  />
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
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={loading || saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
