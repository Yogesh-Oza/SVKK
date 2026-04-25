import type { SidebarData } from "@/lib/types";
import {
  IconBrowserCheck,
  IconCalendar,
  IconChartBar,
  IconChecklist,
  IconNotification,
  IconPalette,
  IconSettings,
  IconUserCog,
} from "@tabler/icons-react";
import { KanbanIcon } from "lucide-react";

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: "Dashboard",
      items: [
        {
          title: "Alerts",
          url: "/alerts",
          icon: IconNotification,
          adminOnly: true,
        },
        {
          title: "Notifications",
          url: "/notifications",
          icon: IconNotification,
        },
        {
          title: "Analytics",
          url: "/analytics",
          icon: IconChartBar,
        },
      ],
    },
    {
      title: "General",
      items: [
        {
          title: "Tasks",
          url: "/tasks",
          icon: IconChecklist,
        },
        {
          title: "Calendar",
          url: "/calendar",
          icon: IconCalendar,
        },
        {
          title: "Kanban",
          url: "/kanban",
          icon: KanbanIcon,
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
