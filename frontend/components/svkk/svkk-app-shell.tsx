"use client";

import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { getSvkkNavForRole } from "@/lib/svkk/permissions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SvkkAppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSvkkAuth();
  const pathname = usePathname();
  const nav = user ? getSvkkNavForRole(user.role) : [];

  return (
    <div className="bg-background min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
              SVKK
            </Link>
            <nav className="hidden flex-wrap gap-1 md:flex">
              {nav.map((item) => (
                <Button
                  key={item.id}
                  variant={pathname === item.href ? "secondary" : "ghost"}
                  size="sm"
                  asChild
                >
                  <Link href={item.href}>{item.label}</Link>
                </Button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground max-w-[12rem] truncate">
              {user?.name} · {user?.role}
            </span>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
