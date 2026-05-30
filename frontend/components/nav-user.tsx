"use client";

import { useAuth } from "@/contexts/auth-context";
import { BadgeCheck, ChevronDown, LogOut, User } from "lucide-react";
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
              className="border-sidebar-border hover:bg-sidebar-accent/15 data-[state=open]:bg-sidebar-accent/15 h-auto rounded-lg border bg-transparent px-3 py-3"
            >
              <Avatar className="border-sidebar-border size-9 shrink-0 rounded-full border">
                <AvatarImage src={user.avatar} alt={displayName} />
                <AvatarFallback className="bg-sidebar-accent/15 text-sidebar-foreground rounded-full">
                  <User className="size-5" strokeWidth={1.75} />
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="text-sidebar-foreground/70 truncate text-xs">Welcome,</span>
                <span className="text-sidebar-foreground truncate text-sm font-semibold">{displayName}</span>
              </div>
              <ChevronDown className="text-sidebar-foreground/70 ml-auto size-4 shrink-0" />
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
                <Link href="/settings">
                  <BadgeCheck />
                  Profile
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
