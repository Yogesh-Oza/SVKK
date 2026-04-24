import { SvkkAuthProvider } from "@/contexts/svkk-auth-context";
import type { ReactNode } from "react";

export default function SvkkRouteGroupLayout({ children }: { children: ReactNode }) {
  return <SvkkAuthProvider>{children}</SvkkAuthProvider>;
}
