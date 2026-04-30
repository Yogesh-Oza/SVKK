"use client";

import { AdPolicyAddForm } from "@/features/svkk-policies/ad-policy-add-form";
import { useParams, useSearchParams } from "next/navigation";

export default function EditPolicyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String(params.id ?? "");
  const editYearLabel = searchParams.get("year")?.trim() ?? "";
  return <AdPolicyAddForm policyId={id} editYearLabel={editYearLabel} />;
}
