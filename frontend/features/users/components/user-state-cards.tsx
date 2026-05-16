import { Card, CardContent } from "@/components/ui/card";
import type { SvkkRole } from "@/lib/svkk/permissions";
import { SVKK_ROLE_LABELS } from "@/lib/svkk/role-labels";
import { Shield, UserCircle, Users } from "lucide-react";
import type { User } from "../utils/schema";

interface UserStateCardsProps {
  users: User[];
}

const ROLE_ICONS: Record<SvkkRole, typeof Users> = {
  USER: UserCircle,
  SUPERVISOR: Users,
  ADMIN: Shield,
  SUPER_ADMIN: Shield,
};

const LEGACY_ROLES: SvkkRole[] = ["USER", "SUPERVISOR", "ADMIN", "SUPER_ADMIN"];

export function UserStateCards({ users }: UserStateCardsProps) {
  const totalUsers = users.length;

  const metrics = [
    {
      title: "Total users",
      value: totalUsers,
      icon: Users,
    },
    ...LEGACY_ROLES.map((role) => ({
      title: SVKK_ROLE_LABELS[role],
      value: users.filter((u) => u.roleSlug === role).length,
      icon: ROLE_ICONS[role],
    })),
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {metrics.map((metric, index) => (
        <Card key={index} className="border">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <metric.icon className="text-muted-foreground size-6" />
            </div>
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm font-medium">{metric.title}</p>
              <div className="text-2xl font-bold">{metric.value}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
