"use client";

import { AdPolicyAddForm } from "@/features/svkk-policies/ad-policy-add-form";
import { useParams } from "next/navigation";

export default function EditPolicyPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  return <AdPolicyAddForm policyId={id} />;
}
