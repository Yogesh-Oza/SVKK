import type { SidebarData } from "@/lib/types";
import {
  IconBrowserCheck,
  IconNotification,
  IconPalette,
  IconSettings,
  IconUserCog,
} from "@tabler/icons-react";

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: "Other",
      items: [
        {
          title: "Settings",
          icon: IconSettings,
          // badge: "Coming Soon",
          items: [
            {
              title: "Profile",
              url: "/settings",
              icon: IconUserCog,
            },
            {
              title: "Appearance",
              url: "/settings/appearance",
              icon: IconPalette,
            },
            {
              title: "Notifications",
              url: "/settings/notifications",
              icon: IconNotification,
            },
            {
              title: "Display",
              url: "/settings/display",
              icon: IconBrowserCheck,
            },
          ],
        },
      ],
    },
  ],
};
