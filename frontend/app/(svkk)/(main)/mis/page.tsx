"use client";

import { PolicyMemberReportSection } from "@/features/svkk-mis/policy-member-report-section";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { canAccessMis } from "@/lib/svkk/permissions";
import { useState } from "react";

export default function SvkkMisPage() {
  const { user } = useSvkkAuth();
  const [err, setErr] = useState<string | null>(null);
  const missingUrl = !getSvkkApiBase();

  if (user && !canAccessMis(user.permissions)) {
    return <p className="text-muted-foreground text-sm">You do not have access to MIS.</p>;
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">MIS</h1>
      {err ? <p className="text-destructive text-sm">{err}</p> : null}
      <PolicyMemberReportSection onError={(m) => setErr(m || null)} />
    </div>
  );
}
