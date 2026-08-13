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
import { svkkJson } from "@/lib/svkk/api";

import { emptyClaimEditForm, formToClaimPatch, type ClaimEditFormValues } from "./claim-edit-form";
import { ClaimFormFields } from "./claim-form-fields";

type ClaimAddDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function ClaimAddDialog({ open, onClose, onCreated }: ClaimAddDialogProps) {
  const [claimNo, setClaimNo] = useState("");
  const [form, setForm] = useState<ClaimEditFormValues>(emptyClaimEditForm);
  const [saving, setSaving] = useState(false);

  function onChange(key: keyof ClaimEditFormValues, value: string) {
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
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Add new claim entry</DialogTitle>
          <DialogDescription>
            Fill in claim details. Claim #, SVKK ID, and policy year are required. Policy number is a
            CSV snapshot and does not link a policy automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <ClaimFormFields
            form={form}
            onChange={onChange}
            mode="create"
            claimNo={claimNo}
            onClaimNoChange={setClaimNo}
          />
        </div>
        <DialogFooter className="shrink-0 border-t px-6 py-4">
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
