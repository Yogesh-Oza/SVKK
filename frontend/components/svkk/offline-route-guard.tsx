"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useOfflineStatus } from "@/lib/svkk/offline/use-offline-status";
import { isOfflineAllowedPath } from "@/lib/svkk/offline/offline-nav";
import { replacePolicyRoute } from "@/lib/svkk/offline/navigate";
import { toast } from "sonner";

/** Redirect away from online-only pages when the browser is offline. */
export function OfflineRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { online } = useOfflineStatus();
  const lastToastRef = useRef<string | null>(null);

  useEffect(() => {
    if (online || !pathname) return;
    if (isOfflineAllowedPath(pathname)) return;

    if (lastToastRef.current !== pathname) {
      lastToastRef.current = pathname;
      toast.info("This page needs internet. Showing policies.", { id: "offline-route-guard" });
    }
    replacePolicyRoute("/policies", router);
  }, [online, pathname, router]);

  return <>{children}</>;
}
