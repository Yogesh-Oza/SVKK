"use client";

import { useCallback, useState } from "react";
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

import {
  emptyClaimEditForm,
  formToClaimPatch,
  mergeEmptyClaimFieldsFromPolicy,
  type ClaimEditFormValues,
} from "./claim-edit-form";
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

  const fillEmptyFromPolicy = useCallback((patch: Partial<ClaimEditFormValues>) => {
    setForm((prev) => mergeEmptyClaimFieldsFromPolicy(prev, patch));
  }, []);

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
    if (!form.svkkPublicId.trim() && !form.policyNoText.trim()) {
      toast.error("Enter an SVKK ID, or a Policy Number so SVKK can be filled from the policy");
      return;
    }
    if (!form.policyYear.trim() && !form.policyNoText.trim()) {
      toast.error("Enter a policy year, or a Policy Number so the year can be filled from the policy");
      return;
    }
    const patch = formToClaimPatch(form);
    if (!patch.ok) {
      toast.error(patch.error);
      return;
    }
    setSaving(true);
    try {
      const created = await svkkJson<{
        id: string;
        policyId?: string | null;
        matchStatus?: string | null;
        svkkPublicId?: string | null;
        policyLinkWarning?: string | null;
      }>("/claims", {
        method: "POST",
        body: JSON.stringify({ claimNo: no, ...patch.body }),
      });
      if (created.policyLinkWarning) {
        toast.success("Claim created");
        toast.warning(created.policyLinkWarning);
      } else if (created.policyId) {
        toast.success(
          created.svkkPublicId
            ? `Claim created and linked · SVKK ${created.svkkPublicId}`
            : "Claim created and linked to policy",
        );
      } else {
        toast.success("Claim created");
      }
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
            Claim # is required. Enter a Policy Number to auto-link and fill blank SVKK ID, year,
            holder, type, grouping, category, and village from the policy — same as Edit.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <ClaimFormFields
            form={form}
            onChange={onChange}
            mode="create"
            claimNo={claimNo}
            onClaimNoChange={setClaimNo}
            onFillEmptyFromPolicy={fillEmptyFromPolicy}
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
