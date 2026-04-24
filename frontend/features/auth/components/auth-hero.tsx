"use client";

import Link from "next/link";

interface AuthHeroProps {
  children?: React.ReactNode;
}

/**
 * Branded left panel for CRM auth pages (Shree Vagad Kala Kendra — policy / claims system).
 */
export function AuthHero({ children }: AuthHeroProps) {
  return (
    <div className="relative hidden overflow-hidden bg-zinc-950 lg:block">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-zinc-950 to-slate-950" />
        <div className="absolute inset-0 bg-gradient-to-tr from-teal-600/20 via-transparent to-cyan-600/10" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-teal-500/15 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between p-12">
        <Link href="/" className="group w-fit">
          <div className="flex items-center gap-3">
            <div className="bg-teal-500/20 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-teal-500/40 text-lg font-bold tracking-tight text-teal-300 transition group-hover:border-teal-400/60 group-hover:text-teal-200">
              SV
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight text-white">SVKK</p>
              <p className="text-xs text-zinc-500">Shree Vagad Kala Kendra</p>
            </div>
          </div>
        </Link>

        <div className="flex flex-1 flex-col items-center justify-center space-y-8">
          {children ?? (
            <div className="max-w-md space-y-4 text-center">
              <p className="text-teal-400/90 text-sm font-medium tracking-[0.2em] uppercase">
                Mediclaim policy platform
              </p>
              <h2 className="text-3xl leading-tight font-bold text-white md:text-4xl">
                Policies, premiums &amp;{" "}
                <span className="text-teal-400">claims</span> in one place
              </h2>
              <p className="text-base text-zinc-400">
                Year-wise policies, SVKK ID, chart-based premium calculation, and MIS—built
                for transparent insurance operations and secure, role-based access.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm text-zinc-500">
            © {new Date().getFullYear()} Shree Vagad Kala Kendra (SVKK). Operations console.
          </p>
        </div>
      </div>
    </div>
  );
}
