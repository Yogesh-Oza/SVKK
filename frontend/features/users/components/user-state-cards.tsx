import { Card, CardContent } from "@/components/ui/card";
import { SVKK_ROLE_LABELS, type SvkkUserRole, type User } from "../utils/schema";
import { Shield, UserCircle, Users } from "lucide-react";

interface UserStateCardsProps {
  users: User[];
}

const ROLE_ICONS: Record<SvkkUserRole, typeof Users> = {
  USER: UserCircle,
  SUPERVISOR: Users,
  ADMIN: Shield,
  SUPER_ADMIN: Shield,
};

export function UserStateCards({ users }: UserStateCardsProps) {
  const totalUsers = users.length;
  const roles: SvkkUserRole[] = ["USER", "SUPERVISOR", "ADMIN", "SUPER_ADMIN"];

  const metrics = [
    {
      title: "Total users",
      value: totalUsers,
      icon: Users,
    },
    ...roles.map((role) => ({
      title: SVKK_ROLE_LABELS[role],
      value: users.filter((u) => u.role === role).length,
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
              <p className="text-muted-foreground text-sm font-medium">
                {metric.title}
              </p>
              <div className="text-2xl font-bold">{metric.value}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
