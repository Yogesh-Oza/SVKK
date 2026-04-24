"use client";

import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-4">
      <div className="bg-card w-full max-w-md space-y-6 rounded-lg border p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">SVKK</h1>
          <p className="text-muted-foreground text-sm">Sign in to the mediclaim console.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        {missingUrl ? (
          <p className="text-muted-foreground text-xs">
            Configure <code className="font-mono">NEXT_PUBLIC_API_URL</code> (e.g. http://localhost:4000/api/v1)
          </p>
        ) : null}
      </div>
    </div>
  );
}
