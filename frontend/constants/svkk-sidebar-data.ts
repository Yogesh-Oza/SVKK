import type { NavGroup } from "@/lib/types";
import {
  getSvkkNavForRole,
  type SvkkNavId,
  type SvkkRole,
} from "@/lib/svkk/permissions";
import {
  IconCalculator,
  IconChartBar,
  IconFileDescription,
  IconHistory,
  IconLayoutDashboard,
  IconSettings,
  IconStethoscope,
  IconUpload,
  IconUsers,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

const ICON_BY_ID: Record<SvkkNavId, ComponentType<{ className?: string }>> = {
  dashboard: IconLayoutDashboard,
  calculator: IconCalculator,
  policies: IconFileDescription,
  claims: IconStethoscope,
  mis: IconChartBar,
  csv: IconUpload,
  admin: IconSettings,
  logs: IconHistory,
  users: IconUsers,
};

/**
 * Sidebar nav for SVKK (same items as the old top bar, with icons).
 */
export function getSvkkNavGroupsForRole(role: SvkkRole): NavGroup[] {
  const items = getSvkkNavForRole(role).map((n) => ({
    title: n.label,
    url: n.href,
    icon: ICON_BY_ID[n.id],
  }));
  /** Label matches product area; "SVKK" stays only in the logo to avoid a duplicate heading. */
  return [{ title: "MediClaim", items }];
}
