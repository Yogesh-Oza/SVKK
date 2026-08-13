"use client";

import { useCallback, useEffect, useState } from "react";
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

import type { ClaimDetail } from "./claim-detail-types";
import {
  claimDetailToForm,
  emptyClaimEditForm,
  formToClaimPatch,
  mergeEmptyClaimFieldsFromPolicy,
  type ClaimEditFormValues,
} from "./claim-edit-form";
import { ClaimFormFields } from "./claim-form-fields";

type ClaimEditDialogProps = {
  claimId: string | null;
  claimNo?: string | null;
  onClose: () => void;
  onSaved: (detail: ClaimDetail) => void;
};

export function ClaimEditDialog({ claimId, claimNo, onClose, onSaved }: ClaimEditDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState<{
    claimNo: string;
    policyNo: string;
    matchStatus: string | null;
  } | null>(null);
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
          policyNo: detail.policy?.policyNo ?? detail.policyNoText ?? "—",
          matchStatus: detail.matchStatus ?? null,
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

  function onChange(key: keyof ClaimEditFormValues, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const fillEmptyFromPolicy = useCallback((patch: Partial<ClaimEditFormValues>) => {
    setForm((prev) => mergeEmptyClaimFieldsFromPolicy(prev, patch));
  }, []);

  async function handleSave() {
    if (!claimId) return;
    const parsed = formToClaimPatch(form);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    setSaving(true);
    try {
      const updated = await svkkJson<ClaimDetail & { policyLinkWarning?: string | null }>(
        `/claims/${claimId}`,
        {
          method: "PATCH",
          body: JSON.stringify(parsed.body),
        },
      );
      if (updated.policyLinkWarning) {
        toast.success("Claim updated");
        toast.warning(updated.policyLinkWarning);
      } else if (updated.matchStatus === "UNLINKED") {
        toast.success("Claim updated and unlinked from policy");
      } else if (updated.matchStatus === "CONFLICT") {
        toast.success("Claim updated");
        toast.warning("Several policies share that Policy Number — claim was left unlinked");
      } else if (updated.policyId) {
        toast.success("Claim updated and linked to policy");
      } else {
        toast.success(
          form.policyNoText.trim() ? "Claim updated" : "Claim updated (policy unlinked)",
        );
      }
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
            Update claim fields. Matching runs when you click Save — typing a new Policy Number
            does not change the saved link yet. Clearing it unlinks the claim on save.
            {meta ? (
              <span className="mt-1 block font-mono text-xs">
                {meta.claimNo}
                {meta.policyNo !== "—"
                  ? ` · Currently saved: ${meta.matchStatus === "MATCHED_EXACT" ? "Matched" : meta.matchStatus ?? "linked"} · ${meta.policyNo}`
                  : " · Currently saved: not linked"}
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
            <ClaimFormFields
              form={form}
              onChange={onChange}
              mode="edit"
              savedLinkedPolicyNo={meta?.policyNo === "—" ? null : meta?.policyNo}
              onFillEmptyFromPolicy={fillEmptyFromPolicy}
            />
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
