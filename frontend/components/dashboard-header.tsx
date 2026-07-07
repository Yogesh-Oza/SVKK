"use client";

import { NotificationBell } from "@/components/notification-bell";
import { OfflineConnectionIndicator } from "@/components/svkk/offline-connection-indicator";
import { ToggleTheme } from "@/components/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

export function DashboardHeader() {
  const [mounted, setMounted] = React.useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;

    const authParam = searchParams.get("auth");
    if (authParam === "success") {
      toast.success("Signed in successfully!", {
        description: "Welcome back to your dashboard.",
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("auth");
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [mounted, searchParams, router]);

  return (
    <header className="z-50 flex h-16 shrink-0 items-center gap-2 border-b border-border/50 bg-background/95 px-4 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
      <SidebarTrigger className="-ml-1 text-muted-foreground transition-colors hover:text-foreground" />
      <div className="ml-auto flex items-center gap-2">
        <OfflineConnectionIndicator />
        {mounted ? (
          <>
            <ToggleTheme />
            <NotificationBell />
          </>
        ) : null}
      </div>
    </header>
  );
}
