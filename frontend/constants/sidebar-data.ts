import type { SidebarData } from "@/lib/types";
import {
  IconBrowserCheck,
  IconCalendar,
  IconNotification,
  IconPalette,
  IconSettings,
  IconUserCog,
} from "@tabler/icons-react";

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: "Dashboard",
      items: [
        {
          title: "Notifications",
          url: "/notifications",
          icon: IconNotification,
        },
      ],
    },
    {
      title: "General",
      items: [
        {
          title: "Calendar",
          url: "/calendar",
          icon: IconCalendar,
        },
      ],
    },
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
