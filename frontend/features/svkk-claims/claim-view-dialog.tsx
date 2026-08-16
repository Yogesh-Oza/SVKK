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
import { svkkJson } from "@/lib/svkk/api";

import type { ClaimDetail } from "./claim-detail-types";
import {
  claimDetailToForm,
  emptyClaimEditForm,
  type ClaimEditFormValues,
} from "./claim-edit-form";
import { ClaimFormFields } from "./claim-form-fields";

type ClaimViewDialogProps = {
  claimId: string | null;
  claimNo?: string | null;
  onClose: () => void;
};

export function ClaimViewDialog({ claimId, claimNo, onClose }: ClaimViewDialogProps) {
  const [loading, setLoading] = useState(false);
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

  return (
    <Dialog open={!!claimId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>View claim details</DialogTitle>
          <DialogDescription>
            All fields for this claim row. Same Claim Number can appear on more than one row when
            the TPA split payments.
            {meta ? (
              <span className="mt-1 block font-mono text-xs">
                {meta.claimNo}
                {meta.policyNo !== "—"
                  ? ` · ${meta.matchStatus === "MATCHED_EXACT" ? "Matched" : meta.matchStatus ?? "linked"} · ${meta.policyNo}`
                  : " · not linked"}
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
              onChange={() => undefined}
              mode="view"
              claimNo={meta?.claimNo ?? claimNo ?? ""}
              savedLinkedPolicyNo={meta?.policyNo === "—" ? null : meta?.policyNo}
            />
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
