import type { SidebarData } from "@/lib/types";
import { IconSettings } from "@tabler/icons-react";

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: "Other",
      items: [
        {
          title: "Settings",
          url: "/settings",
          icon: IconSettings,
        },
      ],
    },
  ],
};
