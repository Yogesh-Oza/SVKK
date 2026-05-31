"use client";

import { PolicyMemberReportSection } from "@/features/svkk-mis/policy-member-report-section";
import { ClaimReportSection } from "@/features/svkk-mis/claim-report-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { canAccessMis } from "@/lib/svkk/permissions";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function SvkkMisPage() {
  const { user } = useSvkkAuth();
  const searchParams = useSearchParams();
  const [err, setErr] = useState<string | null>(null);
  const missingUrl = !getSvkkApiBase();

  const activeTab = useMemo(() => {
    return searchParams.get("tab") === "claim" ? "claim" : "policy";
  }, [searchParams]);

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
      <Tabs key={activeTab} defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="policy">Policy MIS</TabsTrigger>
          <TabsTrigger value="claim">Claim MIS</TabsTrigger>
        </TabsList>
        <TabsContent value="policy" className="mt-6">
          <PolicyMemberReportSection onError={(m) => setErr(m || null)} />
        </TabsContent>
        <TabsContent value="claim" className="mt-6">
          <ClaimReportSection onError={(m) => setErr(m || null)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
