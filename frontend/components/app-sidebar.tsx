"use client";

import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  Sidebar as UISidebar,
} from "@/components/ui/sidebar";
import { getSvkkNavGroupsForPermissions } from "@/constants/svkk-sidebar-data";
import { sidebarData } from "@/constants/sidebar-data";
import { useAuth } from "@/contexts/auth-context";
import { useSidebarConfig } from "@/contexts/sidebar-context";
import type { NavGroup as NavGroupType, NavItem } from "@/lib/types";
import { filterNavGroupsForOffline } from "@/lib/svkk/offline/offline-nav";
import { useOfflineStatus } from "@/lib/svkk/offline/use-offline-status";
import { useAppSelector } from "@/lib/store/hooks";
import React, { useMemo } from "react";
import { NavGroup } from "./nav-group";
import { NavUser } from "./nav-user";
import { SidebarLogo } from "./sidebar-logo";

function filterNavGroupsByRole(navGroups: NavGroupType[], isAdmin: boolean): NavGroupType[] {
  if (isAdmin) return navGroups;
  return navGroups
    .map((group) => {
      const visibleItems = group.items.filter(
        (item) => !(item as NavItem & { adminOnly?: boolean }).adminOnly
      );
      const itemsWithFilteredSub = visibleItems.map((item) => {
        if (!item.items) return item;
        const visibleSub = item.items.filter(
          (sub) => !(sub as { adminOnly?: boolean }).adminOnly
        );
        return { ...item, items: visibleSub };
      });
      const finalItems = itemsWithFilteredSub.filter(
        (item) => !item.items || item.items.length > 0
      );
      return { ...group, items: finalItems };
    })
    .filter((group) => group.items.length > 0);
}

export default function AppSidebar({
  ...props
}: React.ComponentProps<typeof UISidebar>) {
  const { user } = useAuth();
  const sessionUser = useAppSelector((s) => s.auth.user);
  const { config } = useSidebarConfig();
  const { online } = useOfflineStatus();
  const isAdmin = user?.role === "admin";

  /** One sidebar: MediClaim (SVKK API) links first, then CRM (notifications, settings, …). */
  const navGroups = useMemo((): NavGroupType[] => {
    const crm = filterNavGroupsByRole(sidebarData.navGroups, isAdmin);
    if (!sessionUser) {
      return online ? crm : [];
    }
    const svkk = getSvkkNavGroupsForPermissions(sessionUser.permissions ?? []);
    const merged = [...svkk, ...crm];
    if (!online) {
      return filterNavGroupsForOffline(merged);
    }
    return merged;
  }, [sessionUser, isAdmin, online]);

  const navUserRole = useMemo(() => {
    if (sessionUser?.roleName) {
      return sessionUser.roleName;
    }
    return user?.role;
  }, [sessionUser, user?.role]);

  return (
    <UISidebar
      variant={config.variant}
      collapsible={config.collapsible}
      side={config.side}
      className="border-r border-sidebar-border"
      {...props}
    >
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <SidebarLogo />
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        {navGroups.map((nav, idx) => (
          <NavGroup key={nav.title} showTopSeparator={idx > 0} {...nav} />
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        {user && (
          <NavUser
            user={{
              name: user.name,
              email: user.email,
              avatar: user.avatar || "",
              role: navUserRole,
            }}
          />
        )}
      </SidebarFooter>
      <SidebarRail />
    </UISidebar>
  );
}
