import { Suspense } from "react";
import { AdPolicyAddForm } from "@/features/svkk-policies/ad-policy-add-form";

export default function NewPolicyPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
      <AdPolicyAddForm />
    </Suspense>
  );
}
