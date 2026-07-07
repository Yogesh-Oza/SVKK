import AppSidebar from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { OfflinePolicyRoute } from "@/components/svkk/offline-policy-route";
import { OfflineProvider } from "@/components/svkk/offline-provider";
import { OfflineRouteGuard } from "@/components/svkk/offline-route-guard";
import { SvkkAuthGate } from "@/components/svkk/svkk-auth-gate";
import { SvkkPermissionGate } from "@/components/svkk/svkk-permission-gate";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SidebarConfigProvider } from "@/contexts/sidebar-context";
import { Suspense, type ReactNode } from "react";

/**
 * SVKK mediclaim app uses the same shell as the CRM: collapsible sidebar, command header, and main area.
 * The sidebar merges MediClaim (SVKK) and CRM sections in one list (see AppSidebar).
 */
export default function SvkkMainLayout({ children }: { children: ReactNode }) {
  return (
    <SvkkAuthGate>
      <OfflineProvider>
        <OfflineRouteGuard>
        <SvkkPermissionGate>
        <SidebarConfigProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="flex min-h-svh min-w-0 flex-col bg-[#F9FAFB]">
              <Suspense>
                <DashboardHeader />
              </Suspense>
              <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
                <div className="flex min-w-0 flex-col gap-4 p-4 pt-0">
                  <OfflinePolicyRoute>{children}</OfflinePolicyRoute>
                </div>
              </div>
            </SidebarInset>
          </SidebarProvider>
        </SidebarConfigProvider>
        </SvkkPermissionGate>
        </OfflineRouteGuard>
      </OfflineProvider>
    </SvkkAuthGate>
  );
}
