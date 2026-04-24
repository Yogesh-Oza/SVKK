import { SvkkAppShell } from "@/components/svkk/svkk-app-shell";
import { SvkkAuthGate } from "@/components/svkk/svkk-auth-gate";
import type { ReactNode } from "react";

export default function SvkkMainLayout({ children }: { children: ReactNode }) {
  return (
    <SvkkAuthGate>
      <SvkkAppShell>{children}</SvkkAppShell>
    </SvkkAuthGate>
  );
}
