"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NavCollapsible, NavItem, NavLink, type NavGroup } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { Badge } from "./ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "./ui/sidebar";

const navLinkClass = (isActive: boolean) =>
  cn(
    "group/link relative rounded-lg transition-colors duration-200",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm"
      : "text-white/90 hover:bg-white/10 hover:text-white",
  );

const navIconClass = (isActive: boolean) =>
  cn(
    "transition-colors",
    isActive ? "text-white" : "text-white/75 group-hover/link:text-white",
  );

export function NavGroup({
  title,
  items,
  showTopSeparator = false,
}: NavGroup & { showTopSeparator?: boolean }) {
  const pathName = usePathname();
  const { state } = useSidebar();

  return (
    <SidebarGroup className={cn(showTopSeparator && "border-t border-white/10 pt-3")}>
      <SidebarGroupLabel className="sr-only">{title}</SidebarGroupLabel>
      <SidebarMenu className="gap-1 px-1">
        {items.map((item) => {
          const key = `${item.title}-${item.url}`;

          if (!item.items)
            return <SidebarMenuLink key={key} item={item} href={pathName} />;

          if (state === "collapsed")
            return (
              <SidebarMenuCollapsedDropdown
                key={key}
                item={item}
                href={pathName}
              />
            );

          return (
            <SidebarMenuCollapsible key={key} item={item} href={pathName} />
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

const NavBadge = ({
  children,
  color = "violet",
}: {
  children: ReactNode;
  color?: "violet" | "green";
}) => {
  const colorClasses =
    color === "green"
      ? "bg-emerald-500/20 text-emerald-100"
      : "bg-white/15 text-white";

  return (
    <Badge
      className={`ml-auto rounded-full border-0 px-2 py-0.5 text-[10px] font-medium ${colorClasses}`}
    >
      {children}
    </Badge>
  );
};

const SidebarMenuLink = ({ item, href }: { item: NavLink; href: string }) => {
  const { setOpenMobile } = useSidebar();
  const isActive = checkIsActive(href, item);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={item.title}
        className={navLinkClass(isActive)}
      >
        <Link href={item.url} onClick={() => setOpenMobile(false)}>
          {item.icon && <item.icon className={navIconClass(isActive)} />}
          <span>{item.title}</span>
          {item.badge && (
            <NavBadge color={item.badgeColor}>{item.badge}</NavBadge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
};

const SidebarMenuCollapsible = ({
  item,
  href,
}: {
  item: NavCollapsible;
  href: string;
}) => {
  const { setOpenMobile } = useSidebar();
  const isActive = checkIsActive(href, item, true);

  return (
    <Collapsible asChild defaultOpen={isActive} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            className={cn(navLinkClass(isActive), !isActive && "data-[state=open]:bg-white/10")}
          >
            {item.icon && <item.icon className={navIconClass(isActive)} />}
            <span>{item.title}</span>
            {item.badge && (
              <NavBadge color={item.badgeColor}>{item.badge}</NavBadge>
            )}
            <ChevronRight className="ml-auto size-4 text-white/60 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="CollapsibleContent">
          <SidebarMenuSub className="ml-3.5 border-l border-white/15">
            {item.items.map((subItem) => {
              const isSubActive = checkIsActive(href, subItem);
              return (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={isSubActive}
                    className={cn(
                      "rounded-md transition-colors",
                      isSubActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-white/80 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <Link
                      href={subItem.url}
                      onClick={() => setOpenMobile(false)}
                    >
                      {subItem.icon && (
                        <subItem.icon
                          className={cn("size-4", isSubActive ? "text-white" : "text-white/70")}
                        />
                      )}
                      <span>{subItem.title}</span>
                      {subItem.badge && (
                        <NavBadge color={subItem.badgeColor}>
                          {subItem.badge}
                        </NavBadge>
                      )}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
};

const SidebarMenuCollapsedDropdown = ({
  item,
  href,
}: {
  item: NavCollapsible;
  href: string;
}) => {
  const isActive = checkIsActive(href, item, true);

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            className={navLinkClass(isActive)}
          >
            {item.icon && <item.icon className={navIconClass(isActive)} />}
            <span>{item.title}</span>
            {item.badge && (
              <NavBadge color={item.badgeColor}>{item.badge}</NavBadge>
            )}
            <ChevronRight className="ml-auto size-4 text-white/60" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={4}
          className="min-w-52 rounded-xl border-border/50 bg-background/95 shadow-xl backdrop-blur-xl"
        >
          <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            {item.title}
            {item.badge && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                {item.badge}
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border/50" />
          {item.items.map((sub) => {
            const isSubActive = checkIsActive(href, sub);
            return (
              <DropdownMenuItem
                key={`${sub.title}-${sub.url}`}
                asChild
                className="rounded-lg"
              >
                <Link
                  href={sub.url}
                  className={cn(
                    "flex items-center gap-2 px-2 py-2",
                    isSubActive && "bg-primary/10 text-primary",
                  )}
                >
                  {sub.icon && <sub.icon className="size-4" />}
                  <span className="max-w-52 text-wrap">{sub.title}</span>
                  {sub.badge && (
                    <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                      {sub.badge}
                    </span>
                  )}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
};

function checkIsActive(href: string, item: NavItem, mainNav = false) {
  return (
    href === item.url ||
    href.split("?")[0] === item.url ||
    !!item?.items?.filter((i) => i.url === href).length ||
    (mainNav &&
      href.split("/")[1] !== "" &&
      href.split("/")[1] === item?.url?.toString().split("/")[1])
  );
}
