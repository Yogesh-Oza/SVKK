import type { NavCollapsible, NavGroup, NavItem } from "@/lib/types";
import {
  getSvkkNavForRole,
  type SvkkNavId,
  type SvkkRole,
} from "@/lib/svkk/permissions";
import {
  IconAdjustments,
  IconCalculator,
  IconChartBar,
  IconFileDescription,
  IconFileInvoice,
  IconFilePlus,
  IconHistory,
  IconLayoutDashboard,
  IconListDetails,
  IconSettings,
  IconStethoscope,
  IconUsers,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

const ICON_BY_ID: Record<SvkkNavId, ComponentType<{ className?: string }>> = {
  dashboard: IconLayoutDashboard,
  calculator: IconCalculator,
  calculatorAdmin: IconAdjustments,
  policies: IconFileDescription,
  policyNew: IconFilePlus,
  claims: IconStethoscope,
  mis: IconChartBar,
  admin: IconListDetails,
  logs: IconHistory,
  users: IconUsers,
  settings: IconFileInvoice,
};

const ADMIN_NAV_IDS: SvkkNavId[] = ["admin", "users", "settings"];

/**
 * Sidebar nav for SVKK. "Policies" is a collapsible: All policies + Add policy (full AD form at `/policies/new`).
 */
export function getSvkkNavGroupsForRole(role: SvkkRole): NavGroup[] {
  const flat = getSvkkNavForRole(role);
  const items: NavItem[] = [];
  for (let i = 0; i < flat.length; i += 1) {
    const n = flat[i]!;
    if (n.id === "calculator" && flat[i + 1]?.id === "calculatorAdmin") {
      const adm = flat[i + 1]!;
      items.push({
        title: "Premium calculator",
        icon: IconCalculator,
        items: [
          { title: "Calculator", url: n.href, icon: IconCalculator },
          { title: "Charts & discounts", url: adm.href, icon: IconAdjustments },
        ],
      });
      i += 1;
      continue;
    }
    if (n.id === "policies" && flat[i + 1]?.id === "policyNew") {
      const add = flat[i + 1]!;
      items.push({
        title: "Policies",
        icon: IconFileDescription,
        items: [
          { title: "All policies", url: n.href, icon: IconFileDescription },
          { title: "Add policy", url: add.href, icon: IconFilePlus },
        ],
      });
      i += 1;
      continue;
    }
    if (n.id === "admin") {
      const subItems: NavCollapsible["items"] = [];
      let j = i;
      while (j < flat.length && ADMIN_NAV_IDS.includes(flat[j]!.id)) {
        const entry = flat[j]!;
        subItems.push({
          title: entry.label,
          url: entry.href,
          icon: ICON_BY_ID[entry.id],
        });
        j += 1;
      }
      items.push({
        title: "Admin",
        icon: IconSettings,
        items: subItems,
      });
      i = j - 1;
      continue;
    }
    items.push({
      title: n.label,
      url: n.href,
      icon: ICON_BY_ID[n.id],
    });
  }
  /** Label matches product area; "SVKK" stays only in the logo to avoid a duplicate heading. */
  return [{ title: "MediClaim", items }];
}
