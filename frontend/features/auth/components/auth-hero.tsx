"use client";

import Link from "next/link";
import { HeartPulse } from "lucide-react";

interface AuthHeroProps {
  children?: React.ReactNode;
}

/**
 * Branded left panel — SVKK Software MEDICLAIM (forest green theme).
 */
export function AuthHero({ children }: AuthHeroProps) {
  return (
    <div className="relative hidden overflow-hidden bg-[#064e3b] lg:block">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/[0.06] via-transparent to-black/10" />

      <div className="relative z-10 flex h-full min-h-screen flex-col justify-between p-10 lg:p-12">
        <Link href="/" className="group w-fit">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 transition group-hover:bg-white/15">
              <HeartPulse className="size-5 text-white" aria-hidden />
            </div>
            <div>
              <p className="text-base font-bold tracking-tight text-white">SVKK Software</p>
              <p className="text-[0.65rem] font-semibold tracking-[0.18em] text-white/75">
                MEDICLAIM
              </p>
            </div>
          </div>
        </Link>

        <div className="flex flex-1 flex-col justify-center py-12">
          {children ?? (
            <div className="max-w-md space-y-4">
              <h2 className="text-3xl font-bold leading-tight text-white md:text-4xl md:leading-tight">
                Secure access to policies, claims, and receipts
              </h2>
              <p className="text-base text-white/80">
                Sign in with your organization account.
              </p>
            </div>
          )}
        </div>

        <p className="text-sm text-white/55">Shree Vagad Kala Kendra</p>
      </div>
    </div>
  );
}
