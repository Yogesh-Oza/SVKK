"use client";

import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  Sidebar as UISidebar,
} from "@/components/ui/sidebar";
import { getSvkkNavGroupsForRole } from "@/constants/svkk-sidebar-data";
import { sidebarData } from "@/constants/sidebar-data";
import { useAuth } from "@/contexts/auth-context";
import { useSidebarConfig } from "@/contexts/sidebar-context";
import type { SvkkRole } from "@/lib/svkk/permissions";
import { SVKK_ROLE_LABELS } from "@/lib/svkk/role-labels";
import type { NavGroup as NavGroupType, NavItem } from "@/lib/types";
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
  const isAdmin = user?.role === "admin";

  /** One sidebar: MediClaim (SVKK API) links first, then CRM (alerts, tasks, settings, …). */
  const navGroups = useMemo((): NavGroupType[] => {
    const crm = filterNavGroupsByRole(sidebarData.navGroups, isAdmin);
    if (!sessionUser) {
      return crm;
    }
    const svkk = getSvkkNavGroupsForRole(sessionUser.role as SvkkRole);
    return [...svkk, ...crm];
  }, [sessionUser, isAdmin]);

  const navUserRole = useMemo(() => {
    if (sessionUser) {
      return SVKK_ROLE_LABELS[sessionUser.role as SvkkRole] ?? sessionUser.role;
    }
    return user?.role;
  }, [sessionUser, user?.role]);

  return (
    <UISidebar
      variant={config.variant}
      collapsible={config.collapsible}
      side={config.side}
      {...props}
    >
      <SidebarHeader>
        <SidebarLogo />
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((nav) => (
          <NavGroup key={nav.title} {...nav} />
        ))}
      </SidebarContent>
      <SidebarFooter>
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
