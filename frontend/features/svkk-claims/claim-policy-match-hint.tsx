"use client";

import { useEffect, useState } from "react";

import { svkkJson } from "@/lib/svkk/api";

import type { ClaimEditFormValues } from "./claim-edit-form";

type MatchPreview = {
  matchStatus: "MATCHED_EXACT" | "UNLINKED" | "CONFLICT" | string;
  matchReason: string;
  linked: boolean;
  matchedPolicyNo: string | null;
  yearLabel: string | null;
  svkkPublicId?: string | null;
  holderName?: string | null;
  village?: string | null;
  policyTypeName?: string | null;
  policyGrouping?: string | null;
  categoryText?: string | null;
  linkWarning: string | null;
};

function parseAmount(raw: string): number | null {
  const t = raw.trim().replace(/[,₹]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function matchTone(status: string, linked: boolean): string {
  if (linked || status === "MATCHED_EXACT") return "text-emerald-700";
  if (status === "CONFLICT") return "text-amber-700";
  return "text-destructive";
}

function isBlankOrNumericVillage(village: string): boolean {
  const t = village.trim();
  return !t || /^\d+(\.\d+)?$/.test(t);
}

export function ClaimPolicyMatchHint({
  form,
  savedLinkedPolicyNo,
  onFillEmpty,
}: {
  form: ClaimEditFormValues;
  savedLinkedPolicyNo?: string | null;
  onFillEmpty?: (patch: Partial<ClaimEditFormValues>) => void;
}) {
  const typed = form.policyNoText.trim();
  const saved = (savedLinkedPolicyNo ?? "").trim();
  const [preview, setPreview] = useState<MatchPreview | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!typed) {
      setPreview(null);
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = window.setTimeout(() => {
      void svkkJson<MatchPreview>("/claims/match-preview", {
        method: "POST",
        body: JSON.stringify({
          policyNoText: typed,
          svkkPublicId: form.svkkPublicId.trim() || null,
          policyHolderName: form.policyHolderName.trim() || null,
          policyTypeText: form.policyTypeText.trim() || null,
          policyStartDate: form.policyStartDate.trim() || null,
          policyEndDate: form.policyEndDate.trim() || null,
          sumInsured: parseAmount(form.sumInsured),
          insuranceCompany: form.insuranceCompany.trim() || null,
          admissionDate: form.admissionDate.trim() || null,
          lodgeDate: form.lodgeDate.trim() || null,
          claimReceivedDate: form.claimReceivedDate.trim() || null,
        }),
      })
        .then((data) => {
          if (!cancelled) setPreview(data);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    typed,
    form.svkkPublicId,
    form.policyHolderName,
    form.policyTypeText,
    form.policyStartDate,
    form.policyEndDate,
    form.sumInsured,
    form.insuranceCompany,
    form.admissionDate,
    form.lodgeDate,
    form.claimReceivedDate,
  ]);

  useEffect(() => {
    if (!preview?.linked || !onFillEmpty) return;
    const patch: Partial<ClaimEditFormValues> = {};
    if (!form.svkkPublicId.trim() && preview.svkkPublicId) patch.svkkPublicId = preview.svkkPublicId;
    if (!form.policyYear.trim() && preview.yearLabel) patch.policyYear = preview.yearLabel;
    if (isBlankOrNumericVillage(form.village) && preview.village) patch.village = preview.village;
    if (!form.policyHolderName.trim() && preview.holderName) {
      patch.policyHolderName = preview.holderName;
    }
    if (!form.policyTypeText.trim() && preview.policyTypeName) {
      patch.policyTypeText = preview.policyTypeName;
    }
    if (!form.policyGroupingText.trim() && preview.policyGrouping) {
      patch.policyGroupingText = preview.policyGrouping;
    }
    if (!form.categoryText.trim() && preview.categoryText) patch.categoryText = preview.categoryText;
    if (Object.keys(patch).length) onFillEmpty(patch);
  }, [preview, form, onFillEmpty]);

  if (!typed) {
    return (
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        Empty policy number unlinks this claim on save.
        {saved ? ` It stays linked to ${saved} until you click Save changes.` : ""}
      </p>
    );
  }

  if (checking && !preview) {
    return <p className="text-muted-foreground text-[11px]">Checking whether this policy number exists…</p>;
  }

  if (!preview) {
    return (
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        Matching runs when you save. The claim stays on its current linked policy until then.
      </p>
    );
  }

  const pending = saved && preview.matchedPolicyNo !== saved && preview.linked;
  const willUnlinkSaved = Boolean(saved) && !preview.linked;

  return (
    <div className={`space-y-0.5 text-[11px] leading-relaxed ${matchTone(preview.matchStatus, preview.linked)}`}>
      {preview.linked ? (
        <p>
          Will link on save to {preview.matchedPolicyNo}
          {preview.yearLabel ? ` (${preview.yearLabel})` : ""}
          {preview.svkkPublicId ? ` · SVKK ${preview.svkkPublicId}` : ""}.
        </p>
      ) : preview.matchStatus === "CONFLICT" ? (
        <p>Cannot link: several policies share this Policy Number.</p>
      ) : (
        <p>Will unlink on save — no policy found for “{typed}”.</p>
      )}
      {willUnlinkSaved ? (
        <p className="text-muted-foreground">
          Not saved yet. The register still shows Matched / {saved} until you click Save changes.
        </p>
      ) : pending ? (
        <p className="text-muted-foreground">
          Not saved yet. The register still shows {saved} until you click Save changes.
        </p>
      ) : null}
    </div>
  );
}
