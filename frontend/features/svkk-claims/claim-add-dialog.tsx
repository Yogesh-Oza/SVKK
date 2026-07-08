"use client";

import { useState } from "react";
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
import { PolicyDateInput } from "@/features/svkk-policies/policy-date-input";
import { svkkJson } from "@/lib/svkk/api";

import { emptyClaimEditForm, formToClaimPatch, type ClaimEditFormValues } from "./claim-edit-form";

type ClaimAddDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function ClaimAddDialog({ open, onClose, onCreated }: ClaimAddDialogProps) {
  const [claimNo, setClaimNo] = useState("");
  const [form, setForm] = useState<ClaimEditFormValues>(emptyClaimEditForm);
  const [saving, setSaving] = useState(false);

  function setField<K extends keyof ClaimEditFormValues>(key: K, value: ClaimEditFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleClose() {
    setClaimNo("");
    setForm(emptyClaimEditForm());
    onClose();
  }

  async function handleSave() {
    const no = claimNo.trim();
    if (!no) {
      toast.error("Claim number is required");
      return;
    }
    if (!form.svkkPublicId.trim()) {
      toast.error("SVKK ID is required");
      return;
    }
    if (!form.policyYear.trim()) {
      toast.error("Policy year is required");
      return;
    }
    const patch = formToClaimPatch(form);
    if (!patch.ok) {
      toast.error(patch.error);
      return;
    }
    setSaving(true);
    try {
      await svkkJson("/claims", {
        method: "POST",
        body: JSON.stringify({ claimNo: no, ...patch.body }),
      });
      toast.success("Claim created");
      handleClose();
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add new claim entry</DialogTitle>
          <DialogDescription>
            Fill in claim details. Claim #, SVKK ID, and policy year are required.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Claim # *</Label>
            <Input value={claimNo} onChange={(e) => setClaimNo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">SVKK ID *</Label>
            <Input value={form.svkkPublicId} onChange={(e) => setField("svkkPublicId", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Policy year *</Label>
            <Input value={form.policyYear} onChange={(e) => setField("policyYear", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Patient name</Label>
            <Input value={form.patientName} onChange={(e) => setField("patientName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Policy holder</Label>
            <Input
              value={form.policyHolderName}
              onChange={(e) => setField("policyHolderName", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Village</Label>
            <Input value={form.village} onChange={(e) => setField("village", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">MD ID</Label>
            <Input value={form.mdId} onChange={(e) => setField("mdId", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Input value={form.categoryText} onChange={(e) => setField("categoryText", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Claim lodge type</Label>
            <Input value={form.claimType} onChange={(e) => setField("claimType", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Actual lodge type</Label>
            <Input
              value={form.actualLodgeType}
              onChange={(e) => setField("actualLodgeType", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Treatment type</Label>
            <Input value={form.treatmentType} onChange={(e) => setField("treatmentType", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Disease category</Label>
            <Input
              value={form.diseaseCategory}
              onChange={(e) => setField("diseaseCategory", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Claim amount</Label>
            <Input value={form.claimAmount} onChange={(e) => setField("claimAmount", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reported lodge amount</Label>
            <Input
              value={form.reportedLodgeAmount}
              onChange={(e) => setField("reportedLodgeAmount", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Approved amount</Label>
            <Input
              value={form.approvedAmount}
              onChange={(e) => setField("approvedAmount", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Discount amount</Label>
            <Input value={form.discountAmount} onChange={(e) => setField("discountAmount", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status text</Label>
            <Input value={form.statusText} onChange={(e) => setField("statusText", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hospital</Label>
            <Input value={form.hospitalName} onChange={(e) => setField("hospitalName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Admission date</Label>
            <PolicyDateInput value={form.admissionDate} onValueChange={(v) => setField("admissionDate", v)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Claim lodge date</Label>
            <PolicyDateInput value={form.lodgeDate} onValueChange={(v) => setField("lodgeDate", v)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Payment date</Label>
            <PolicyDateInput value={form.paymentDate} onValueChange={(v) => setField("paymentDate", v)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Received date</Label>
            <PolicyDateInput
              value={form.claimReceivedDate}
              onValueChange={(v) => setField("claimReceivedDate", v)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : "Save entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
