import type { ReactNode } from "react";

export default function SvkkLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center">
          <span className="text-lg font-semibold tracking-tight">SVKK Software</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
