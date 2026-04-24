import { SvkkAppShell } from "@/components/svkk/svkk-app-shell";
import { SvkkAuthGate } from "@/components/svkk/svkk-auth-gate";
import { SvkkRoleGate } from "@/components/svkk/svkk-role-gate";
import type { ReactNode } from "react";

export default function SvkkMainLayout({ children }: { children: ReactNode }) {
  return (
    <SvkkAuthGate>
      <SvkkRoleGate>
        <SvkkAppShell>{children}</SvkkAppShell>
      </SvkkRoleGate>
    </SvkkAuthGate>
  );
}
