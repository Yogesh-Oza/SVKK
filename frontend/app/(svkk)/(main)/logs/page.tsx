"use client";

import { ActivityLogsView } from "@/features/activity-logs/activity-logs-view";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";

export default function SvkkLogsPage() {
  const { user } = useSvkkAuth();

  if (
    user &&
    !user.permissions?.includes("logs:read") &&
    !user.permissions?.includes("*:*")
  ) {
    return <p className="text-muted-foreground text-sm">You do not have access to activity logs.</p>;
  }

  return <ActivityLogsView />;
}
