"use client";

import Link from "next/link";
import { ShieldPlus } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

/**
 * SVKK + CRM shell branding — light blue-tinted sidebar.
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
          className="h-auto rounded-lg px-2 py-2 hover:bg-sidebar-accent/15 data-[state=open]:bg-sidebar-accent/15"
        >
          <Link href="/dashboard" className="flex items-center gap-3">
            <ShieldPlus className={cnIconSize(isCollapsed)} strokeWidth={1.75} />
            {!isCollapsed && (
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="text-sidebar-foreground truncate text-base font-bold">SVKK</span>
                <span className="text-sidebar-foreground/75 truncate text-sm font-bold">MediClaim Insurance</span>
              </div>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function cnIconSize(collapsed: boolean) {
  return collapsed
    ? "size-7 shrink-0 text-sidebar-foreground"
    : "size-8 shrink-0 text-sidebar-foreground";
}
