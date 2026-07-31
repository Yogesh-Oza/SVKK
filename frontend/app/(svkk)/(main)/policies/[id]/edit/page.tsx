"use client";

import { AdPolicyAddForm } from "@/features/svkk-policies/ad-policy-add-form";
import { useParams, useSearchParams } from "next/navigation";

export default function EditPolicyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params.id ?? "");
  const editYearLabel = searchParams.get("year")?.trim() ?? "";
  // Remount when policy (or year) changes so soft navigation cannot reuse
  // another grouped policy's Formik/detail state.
  return (
    <AdPolicyAddForm
      key={`${id}|${editYearLabel}`}
      policyId={id}
      editYearLabel={editYearLabel}
    />
  );
}
