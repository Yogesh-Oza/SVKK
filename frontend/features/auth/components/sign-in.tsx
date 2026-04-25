"use client";

import { AuthHero } from "@/features/auth/components/auth-hero";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, HeartPulse, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { SignInSchema, signInSchema } from "../utils/sign-in-schema";

export default function SignIn() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!searchParams.get("email") && !searchParams.get("password")) {
      return;
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("email");
    next.delete("password");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [searchParams, pathname, router]);

  const form = useForm<SignInSchema>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: SignInSchema) => {
    try {
      setIsLoading(true);
      await login(data.email, data.password);
      toast.success("Signed in successfully!");
      const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
      router.push(callbackUrl);
      router.refresh();
    } catch (error) {
      console.error("Sign in error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to sign in. Please check your credentials.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const fieldShell =
    "h-12 rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-zinc-900 shadow-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 focus-visible:border-[#064e3b] focus-visible:ring-[#064e3b]/25";

  return (
    <div className="relative grid min-h-screen w-full lg:grid-cols-[2fr_3fr]">
      <AuthHero />

      <div className="relative flex items-center justify-center bg-linear-to-br from-white via-sky-50/70 to-emerald-50/50 p-6 lg:p-12 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 top-1/4 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl dark:bg-emerald-900/20" />
          <div className="absolute -left-16 bottom-1/4 h-64 w-64 rounded-full bg-emerald-200/35 blur-3xl dark:bg-teal-900/15" />
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
              <p className="text-foreground text-sm font-bold">SVKK Software</p>
              <p className="text-muted-foreground text-[0.65rem] font-semibold tracking-[0.15em]">
                MEDICLAIM
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-100/80 bg-white/95 p-8 shadow-[0_20px_50px_-12px_rgba(6,78,59,0.12)] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-black/40">
            <div className="mb-8 space-y-2 text-center lg:text-left">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                Sign in
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Enter your credentials to open the dashboard.
              </p>
            </div>

            <div className="space-y-6">
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-zinc-700 dark:text-zinc-300">
                          Email
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail
                              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
                              aria-hidden
                            />
                            <Input
                              type="email"
                              placeholder="you@organization.com"
                              disabled={isLoading}
                              className={fieldShell}
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between gap-2">
                          <FormLabel className="text-zinc-700 dark:text-zinc-300">
                            Password
                          </FormLabel>
                          <Link
                            href="/reset-password-1"
                            className="text-sm font-medium text-[#064e3b] underline-offset-4 hover:underline dark:text-emerald-400"
                          >
                            Forgot password?
                          </Link>
                        </div>
                        <FormControl>
                          <div className="relative">
                            <Lock
                              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
                              aria-hidden
                            />
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              disabled={isLoading}
                              className={`${fieldShell} pr-12`}
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                              tabIndex={-1}
                            >
                              {showPassword ? (
                                <EyeOff className="size-5" />
                              ) : (
                                <Eye className="size-5" />
                              )}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    className="h-12 w-full rounded-lg border-0 bg-zinc-900 font-semibold text-white shadow-sm transition-all hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                    type="submit"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <svg className="size-4 animate-spin" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Signing in...
                      </span>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>
              </Form>
            </div>
          </div>

          <p className="text-center text-xs text-zinc-500 dark:text-zinc-500">
            SVKK operations console — leads, tasks, policies &amp; claims
          </p>
        </div>
      </div>
    </div>
  );
}
