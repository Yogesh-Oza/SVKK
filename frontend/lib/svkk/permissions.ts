export type SvkkRole = "USER" | "SUPERVISOR" | "ADMIN" | "SUPER_ADMIN";

export type SvkkNavId =
  | "dashboard"
  | "calculator"
  | "policies"
  | "claims"
  | "mis"
  | "csv"
  | "admin"
  | "logs";

const NAV: { id: SvkkNavId; href: string; label: string; roles: SvkkRole[] }[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", roles: ["USER", "SUPERVISOR", "ADMIN", "SUPER_ADMIN"] },
  { id: "calculator", href: "/calculator", label: "Premium calculator", roles: ["USER", "SUPERVISOR", "ADMIN", "SUPER_ADMIN"] },
  { id: "policies", href: "/policies", label: "Policies", roles: ["USER", "SUPERVISOR", "ADMIN", "SUPER_ADMIN"] },
  { id: "claims", href: "/claims", label: "Claims", roles: ["SUPERVISOR", "ADMIN", "SUPER_ADMIN"] },
  { id: "mis", href: "/mis", label: "MIS", roles: ["SUPERVISOR", "ADMIN", "SUPER_ADMIN"] },
  { id: "csv", href: "/upload", label: "CSV upload", roles: ["ADMIN", "SUPER_ADMIN"] },
  { id: "admin", href: "/admin", label: "Admin", roles: ["ADMIN", "SUPER_ADMIN"] },
  { id: "logs", href: "/logs", label: "Activity logs", roles: ["ADMIN", "SUPER_ADMIN"] },
];

/**
 * Returns nav items visible for the given backend role.
 */
export function getSvkkNavForRole(role: SvkkRole) {
  return NAV.filter((n) => n.roles.includes(role));
}
