import type { SvkkRole } from "./permissions";

export type SvkkUser = {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  roleIsActive: boolean;
  permissions: string[];
  /** @deprecated Use roleSlug */
  role: SvkkRole;
};
