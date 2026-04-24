"use client";

import { AuthHero } from "@/features/auth/components/auth-hero";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HeartPulse, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function SvkkLoginPage() {
  const { user, login } = useSvkkAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const api = getSvkkApiBase();
  const missingUrl = !api;

  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (missingUrl) {
      setError("Set NEXT_PUBLIC_API_URL in .env (see .env.example).");
      return;
    }
    setPending(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  if (user) {
    return null;
  }

  const fieldClass =
    "h-12 rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-zinc-900 shadow-none focus-visible:border-[#064e3b] focus-visible:ring-[#064e3b]/25";

  return (
    <div className="relative grid min-h-screen w-full lg:grid-cols-[2fr_3fr]">
      <AuthHero />

      <div className="relative flex items-center justify-center bg-linear-to-br from-white via-sky-50/70 to-emerald-50/50 p-6 lg:p-12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 top-1/4 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
          <div className="absolute -left-16 bottom-1/4 h-64 w-64 rounded-full bg-emerald-200/35 blur-3xl" />
        </div>

        <div className="relative mx-auto w-full max-w-[420px] space-y-8">
          <div className="flex items-center justify-center gap-3 lg:hidden">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#064e3b] text-white shadow-sm ring-1 ring-black/5"
            >
              <HeartPulse className="size-5" aria-hidden />
            </Link>
            <div className="text-left">
              <p className="text-sm font-bold text-zinc-900">SVKK Software</p>
              <p className="text-[0.65rem] font-semibold tracking-[0.15em] text-zinc-500">
                MEDICLAIM
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-100/80 bg-white/95 p-8 shadow-[0_20px_50px_-12px_rgba(6,78,59,0.12)] backdrop-blur-sm">
            <div className="mb-8 space-y-2 text-center lg:text-left">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Sign in</h1>
              <p className="text-sm text-zinc-600">
                Enter your credentials to open the dashboard.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-700">
                  Email
                </Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden
                  />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@organization.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={fieldClass}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-700">
                  Password
                </Label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden
                  />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={fieldClass}
                    required
                  />
                </div>
              </div>
              {error ? <p className="text-destructive text-sm">{error}</p> : null}
              <Button
                type="submit"
                className="h-12 w-full rounded-lg border-0 bg-zinc-900 font-semibold text-white shadow-sm hover:bg-zinc-800"
                disabled={pending}
              >
                {pending ? "Signing in…" : "Sign In"}
              </Button>
            </form>

            {missingUrl ? (
              <p className="text-muted-foreground mt-4 text-xs">
                Configure <code className="font-mono">NEXT_PUBLIC_API_URL</code> (e.g.
                http://localhost:4000/api/v1)
              </p>
            ) : null}
          </div>

          <p className="text-center text-xs text-zinc-500">
            Mediclaim console — Shree Vagad Kala Kendra
          </p>
        </div>
      </div>
    </div>
  );
}
