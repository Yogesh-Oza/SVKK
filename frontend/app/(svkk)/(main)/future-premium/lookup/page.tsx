"use client";

import { FutureLookupPanel } from "@/features/svkk-future-premium/future-lookup-panel";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { canAccessMis } from "@/lib/svkk/permissions";

export default function FutureLookupPage() {
  const { user } = useSvkkAuth();

  if (user && !canAccessMis(user.permissions)) {
    return <p className="text-muted-foreground text-sm">You do not have access to Future Lookup.</p>;
  }

  return <FutureLookupPanel />;
}
