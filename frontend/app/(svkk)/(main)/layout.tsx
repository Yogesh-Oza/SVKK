import AppSidebar from "@/components/app-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
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
      <SvkkPermissionGate>
        <SidebarConfigProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <Suspense>
                <DashboardHeader />
              </Suspense>
              <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
            </SidebarInset>
          </SidebarProvider>
        </SidebarConfigProvider>
      </SvkkPermissionGate>
    </SvkkAuthGate>
  );
}
