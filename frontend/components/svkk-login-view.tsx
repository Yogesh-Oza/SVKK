"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { svkkLogin } from "@/lib/svkk-api";
import { cn } from "@/lib/utils";
import { HeartPulse, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function SvkkLoginView() {
  const router = useRouter();
  const [email, setEmail] = useState(
    process.env.NODE_ENV === "development" ? "admin@svkk.local" : "",
  );
  const [password, setPassword] = useState(
    process.env.NODE_ENV === "development" ? "admin123!" : "",
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await svkkLogin(email, password);
      localStorage.setItem("svkk_access_token", data.accessToken);
      toast.success("Signed in successfully");
      router.push("/dashboard");
    } catch (err) {
      const e = err as Error & { traceId?: string };
      toast.error(e.message || "Sign-in failed", {
        description: e.traceId ? `Reference: ${e.traceId}` : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-40 dark:opacity-30",
          "[background:radial-gradient(ellipse_80%_50%_at_50%_-20%,oklch(0.55_0.15_180),transparent),radial-gradient(ellipse_60%_40%_at_100%_50%,oklch(0.45_0.12_240),transparent),radial-gradient(ellipse_50%_30%_at_0%_80%,oklch(0.5_0.08_200),transparent)]",
        )}
      />
      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        <aside
          className={cn(
            "flex flex-col justify-between px-8 py-10 text-primary-foreground lg:w-[42%] lg:min-h-screen lg:px-12 lg:py-14",
            "bg-linear-to-br from-teal-700 via-emerald-800 to-slate-900 dark:from-teal-900 dark:via-emerald-950 dark:to-slate-950",
          )}
        >
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
                <HeartPulse className="size-6 text-white" aria-hidden />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight text-white">
                  SVKK Software
                </p>
                <p className="text-xs font-medium uppercase tracking-widest text-teal-100/90">
                  Mediclaim
                </p>
              </div>
            </div>
            <div className="hidden max-w-sm space-y-4 lg:block">
              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white">
                Secure access to policies, claims, and receipts
              </h1>
              <p className="text-sm leading-relaxed text-teal-100/85">
                Sign in with your organization account.
              </p>
            </div>
          </div>
          <p className="mt-10 text-xs text-teal-100/80 lg:mt-0">
            Shree Vagad Kala Kendra
          </p>
        </aside>

        <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
          <Card className="w-full max-w-md border-border/80 shadow-lg shadow-black/5 dark:shadow-black/30">
            <CardHeader className="space-y-1 pb-2 text-center sm:text-left">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                Sign in
              </CardTitle>
              <CardDescription className="text-pretty">
                Enter your credentials to open the dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="svkk-email" className="text-foreground">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail
                      className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      id="svkk-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@organization.com"
                      className="h-11 pl-10"
                      value={email}
                      onChange={(ev) => setEmail(ev.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="svkk-password" className="text-foreground">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock
                      className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      id="svkk-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="h-11 pl-10"
                      value={password}
                      onChange={(ev) => setPassword(ev.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="h-11 w-full text-base font-medium shadow-sm"
                  disabled={loading}
                >
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
