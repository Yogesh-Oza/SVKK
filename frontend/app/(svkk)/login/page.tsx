"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { svkkLogin } from "@/lib/svkk-api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function SvkkLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@svkk.local");
  const [password, setPassword] = useState("admin123!");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await svkkLogin(email, password);
      localStorage.setItem("svkk_access_token", data.accessToken);
      toast.success("Signed in");
      router.push("/svkk/dashboard");
    } catch (err) {
      const e = err as Error & { traceId?: string };
      toast.error(e.message, { description: e.traceId ? `Ref: ${e.traceId}` : undefined });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          SVKK API at <code className="text-xs">NEXT_PUBLIC_API_URL</code>
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-sm">
        <Link href="/" className="underline">
          Back to main app
        </Link>
      </p>
    </div>
  );
}
