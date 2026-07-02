import type { NavGroup, NavItem } from "@/lib/types";

/** Routes available without network (policies + premium calculator). */
export function isOfflineAllowedPath(pathname: string): boolean {
  if (pathname === "/offline") return true;
  if (pathname === "/calculator") return true;
  if (pathname === "/policies" || pathname === "/policies/new") return true;
  if (/^\/policies\/[^/]+$/.test(pathname)) return true;
  if (/^\/policies\/[^/]+\/edit$/.test(pathname)) return true;
  return false;
}

function isCalculatorNav(item: NavItem): boolean {
  return "url" in item && item.url === "/calculator";
}

function isPoliciesNav(item: NavItem): item is NavItem & { items: { title: string; url: NavItem extends { url: infer U } ? U : never }[] } {
  return item.title === "Policies" && "items" in item && Boolean(item.items?.length);
}

/** Sidebar: Policies + Premium calculator only when offline. */
export function filterNavGroupsForOffline(groups: NavGroup[]): NavGroup[] {
  for (const group of groups) {
    if (group.title !== "MediClaim") continue;
    const policies = group.items.find(isPoliciesNav);
    const calculator = group.items.find(isCalculatorNav);
    const offlineItems: NavGroup["items"] = [];

    if (policies) {
      const items = policies.items.filter((sub) =>
        sub.title === "All policies" || sub.title === "Add policy",
      );
      if (items.length) {
        offlineItems.push({ title: policies.title, icon: policies.icon, items });
      }
    }

    if (calculator && "url" in calculator) {
      offlineItems.push({
        title: calculator.title,
        url: calculator.url,
        icon: calculator.icon,
      });
    }

    if (!offlineItems.length) continue;
    return [{ title: "MediClaim", items: offlineItems }];
  }
  return [];
}
