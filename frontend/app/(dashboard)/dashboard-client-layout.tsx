"use client";

import AppSidebar from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SidebarConfigProvider } from "@/contexts/sidebar-context";
import { useAppSelector } from "@/lib/store/hooks";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";

/**
 * Client-side auth gate: SVKK httpOnly session is not visible to the Next.js server.
 * We load auth in Redux, then allow the dashboard or redirect to sign-in.
 */
export default function DashboardClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAppSelector((s) => s.auth.user);
  const status = useAppSelector((s) => s.auth.status);
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard";

  useEffect(() => {
    if (status === "loading") {
      return;
    }
    if (status === "unauthenticated" || !user) {
      const u = new URL("/sign-in", window.location.origin);
      u.searchParams.set("callbackUrl", pathname);
      router.replace(u.toString());
    }
  }, [status, user, router, pathname]);

  if (status === "loading" || (status === "authenticated" && !user)) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm">
        Loading session…
      </div>
    );
  }

  if (status === "unauthenticated" || !user) {
    return (
      <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm">
        Redirecting to sign in…
      </div>
    );
  }

  return (
    <SidebarConfigProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex min-h-svh min-w-0 flex-col bg-[#F9FAFB]">
          <Suspense>
            <DashboardHeader />
          </Suspense>
          <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="flex flex-col gap-4 p-4 pt-0">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </SidebarConfigProvider>
  );
}
