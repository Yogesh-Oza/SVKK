"use client";

import { FuturePremiumPanel } from "@/features/svkk-future-premium/future-premium-panel";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { canAccessFuturePremium } from "@/lib/svkk/permissions";

export default function FuturePremiumPage() {
  const { user } = useSvkkAuth();

  if (user && !canAccessFuturePremium(user.permissions)) {
    return <p className="text-muted-foreground text-sm">You do not have access to Future Premium.</p>;
  }

  return <FuturePremiumPanel />;
}
