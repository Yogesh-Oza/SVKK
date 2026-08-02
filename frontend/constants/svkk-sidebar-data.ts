import type { NavCollapsible, NavGroup, NavItem } from "@/lib/types";

import {

  getSvkkNavForPermissions,

  type SvkkNavId,

} from "@/lib/svkk/permissions";

import {

  IconAdjustments,

  IconBell,

  IconCalculator,

  IconChartBar,

  IconFileDescription,

  IconFileInvoice,

  IconFilePlus,

  IconHistory,

  IconSearch,

  IconTimeline,

  IconLayoutDashboard,

  IconListDetails,

  IconMail,

  IconForms,

  IconSettings,

  IconShieldLock,

  IconStethoscope,

  IconWallet,

  IconUsers,

} from "@tabler/icons-react";

import type { ComponentType } from "react";



const ICON_BY_ID: Record<SvkkNavId, ComponentType<{ className?: string }>> = {

  dashboard: IconLayoutDashboard,

  calculator: IconCalculator,

  calculatorAdmin: IconAdjustments,

  policies: IconFileDescription,

  policyNew: IconFilePlus,

  policyArchive: IconHistory,

  futurePremium: IconTimeline,

  futureLookup: IconSearch,

  claims: IconStethoscope,

  wallet: IconWallet,

  mis: IconChartBar,

  notifications: IconBell,

  emailTemplates: IconMail,

  categoryForm: IconForms,

  admin: IconListDetails,

  roles: IconShieldLock,

  logs: IconHistory,

  users: IconUsers,

  settings: IconFileInvoice,

};



const ADMIN_NAV_IDS: SvkkNavId[] = ["admin", "roles", "users", "settings", "emailTemplates", "categoryForm"];



/**

 * Sidebar nav for SVKK driven by effective permissions from `/auth/me`.

 */

export function getSvkkNavGroupsForPermissions(permissions: string[]): NavGroup[] {

  const flat = getSvkkNavForPermissions(permissions);

  const items: NavItem[] = [];

  for (let i = 0; i < flat.length; i += 1) {

    const n = flat[i]!;

    if (n.id === "calculator") {
      if (flat[i + 1]?.id === "calculatorAdmin") {
        const admin = flat[i + 1]!;
        items.push({
          title: "Calculator",
          icon: IconCalculator,
          items: [
            { title: n.label, url: n.href, icon: IconCalculator },
            { title: admin.label, url: admin.href, icon: IconAdjustments },
          ],
        });
        i += 1;
      } else {
        items.push({
          title: n.label,
          url: n.href,
          icon: IconCalculator,
        });
      }
      continue;
    }

    if (n.id === "calculatorAdmin") {
      continue;
    }

    if (n.id === "policies") {
      const subItems: NavCollapsible["items"] = [
        { title: "All policies", url: n.href, icon: IconFileDescription },
      ];
      let j = i + 1;
      while (j < flat.length && (flat[j]!.id === "policyNew" || flat[j]!.id === "policyArchive")) {
        const sub = flat[j]!;
        subItems.push({
          title: sub.id === "policyArchive" ? "Recycle Bin" : sub.label,
          url: sub.href,
          icon: sub.id === "policyArchive" ? IconHistory : IconFilePlus,
        });
        j += 1;
      }
      items.push({
        title: "Policies",
        icon: IconFileDescription,
        items: subItems,
      });
      i = j - 1;
      continue;
    }

    if (n.id === "policyNew" || n.id === "policyArchive") {
      continue;
    }

    if (n.id === "futurePremium" && flat[i + 1]?.id === "futureLookup") {

      const lookup = flat[i + 1]!;

      items.push({

        title: "Future",

        icon: IconTimeline,

        items: [

          { title: "Future Premium", url: n.href, icon: IconTimeline },

          { title: "Lookup", url: lookup.href, icon: IconSearch },

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

  return [{ title: "MediClaim", items }];

}


