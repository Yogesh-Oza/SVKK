import type { SvkkRole } from "./permissions";

export type SvkkUser = {
  id: string;
  email: string;
  name: string;
  role: SvkkRole;
};
