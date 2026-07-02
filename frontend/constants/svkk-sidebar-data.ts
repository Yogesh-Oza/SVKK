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

  IconUsers,

} from "@tabler/icons-react";

import type { ComponentType } from "react";



const ICON_BY_ID: Record<SvkkNavId, ComponentType<{ className?: string }>> = {

  dashboard: IconLayoutDashboard,

  calculator: IconCalculator,

  calculatorAdmin: IconAdjustments,

  policies: IconFileDescription,

  policyNew: IconFilePlus,

  futurePremium: IconTimeline,

  futureLookup: IconSearch,

  claims: IconStethoscope,

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
      items.push({
        title: n.label,
        url: n.href,
        icon: IconCalculator,
      });
      if (flat[i + 1]?.id === "calculatorAdmin") i += 1;
      continue;
    }

    if (n.id === "calculatorAdmin") {
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


