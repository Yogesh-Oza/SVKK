import type { NavGroup, NavItem } from "@/lib/types";

/** Routes that work offline (policy module only in V1). */
export function isOfflineAllowedPath(pathname: string): boolean {
  if (pathname === "/offline") return true;
  if (pathname === "/policies" || pathname === "/policies/new") return true;
  if (/^\/policies\/[^/]+$/.test(pathname)) return true;
  if (/^\/policies\/[^/]+\/edit$/.test(pathname)) return true;
  return false;
}

function isPoliciesNav(item: NavItem): item is NavItem & { items: { title: string; url: NavItem extends { url: infer U } ? U : never }[] } {
  return item.title === "Policies" && "items" in item && Boolean(item.items?.length);
}

/** Sidebar: Policies → All policies + Add policy only. */
export function filterNavGroupsForOffline(groups: NavGroup[]): NavGroup[] {
  for (const group of groups) {
    if (group.title !== "MediClaim") continue;
    const policies = group.items.find(isPoliciesNav);
    if (!policies) continue;
    const items = policies.items.filter((sub) =>
      sub.title === "All policies" || sub.title === "Add policy",
    );
    if (!items.length) continue;
    return [
      {
        title: "MediClaim",
        items: [{ title: policies.title, icon: policies.icon, items }],
      },
    ];
  }
  return [];
}
