"use client";

import { useAuth } from "@/contexts/auth-context";
import {
  BadgeCheck,
  Bell,
  ChevronDown,
  LogOut,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
    role?: string;
  };
}) {
  const { isMobile } = useSidebar();
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Logged out successfully", {
        description: "You have been logged out of your account.",
      });
      router.push("/sign-in");
    } catch {
      toast.error("Logout failed", {
        description: "An error occurred while logging out.",
      });
    }
  };

  const displayName = user.name?.trim() || user.email?.split("@")[0] || "User";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-auto rounded-lg border border-white/20 bg-transparent px-3 py-3 hover:bg-white/10 data-[state=open]:bg-white/10"
            >
              <Avatar className="size-9 shrink-0 rounded-full border border-white/20">
                <AvatarImage src={user.avatar} alt={displayName} />
                <AvatarFallback className="rounded-full bg-white/10 text-white">
                  <User className="size-5" strokeWidth={1.75} />
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-xs text-white/70">Welcome,</span>
                <span className="truncate text-sm font-semibold text-white">{displayName}</span>
              </div>
              <ChevronDown className="ml-auto size-4 shrink-0 text-white/70" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel>
              <div className="flex flex-col gap-0.5 px-1 py-1.5 text-left text-sm">
                <span className="truncate font-semibold">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                {user.role ? (
                  <span className="text-muted-foreground mt-1 text-xs capitalize">{user.role}</span>
                ) : null}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings/account">
                  <BadgeCheck />
                  Account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/notifications">
                  <Bell />
                  Notifications
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
