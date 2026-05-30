"use client";

import Link from "next/link";
import { ShieldPlus } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

/**
 * SVKK + CRM shell branding — corporate navy sidebar style.
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
          className="h-auto rounded-lg px-2 py-2 hover:bg-white/10 data-[state=open]:bg-white/10"
        >
          <Link href="/dashboard" className="flex items-center gap-3">
            <ShieldPlus className={cnIconSize(isCollapsed)} strokeWidth={1.75} />
            {!isCollapsed && (
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-base font-bold text-white">SVKK</span>
                <span className="truncate text-sm font-normal text-white/75">MediClaim Insurance</span>
              </div>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function cnIconSize(collapsed: boolean) {
  return collapsed ? "size-7 shrink-0 text-white" : "size-8 shrink-0 text-white";
}
