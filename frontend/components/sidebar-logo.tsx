"use client";

import Link from "next/link";
import { useSidebar } from "@/components/ui/sidebar";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

/**
 * SVKK + CRM shell branding (NextAuth / dashboard).
 */
export function SidebarLogo() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          asChild
          className="group/logo relative overflow-hidden data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Link href="/dashboard" className="flex items-center gap-2">
            <div
              className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400 ${
                isCollapsed ? "size-8" : "h-9 w-9"
              } text-xs font-bold`}
            >
              SV
            </div>
            {!isCollapsed && (
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">SVKK</span>
                <span className="text-muted-foreground truncate text-xs">MediClaim · CRM</span>
              </div>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
