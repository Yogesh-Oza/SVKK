"use client";

import { PolicyDetailPageView } from "@/features/svkk-policies/policy-detail-page-view";
import { useParams, useSearchParams } from "next/navigation";

export default function SvkkPolicyDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  return (
    <PolicyDetailPageView
      policyId={String(params.id ?? "")}
      initialYearLabel={searchParams.get("year")?.trim() ?? ""}
    />
  );
}
