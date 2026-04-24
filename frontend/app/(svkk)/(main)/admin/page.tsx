"use client";

import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { useEffect, useState } from "react";

type PolicyType = { id: string; name: string; key: string; chartMode: string };

export default function SvkkAdminPage() {
  const { user } = useSvkkAuth();
  const [types, setTypes] = useState<PolicyType[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const missingUrl = !getSvkkApiBase();

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    if (user && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return;
    }
    void (async () => {
      try {
        const list = await svkkJson<PolicyType[]>("/admin/policy-types");
        setTypes(list);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [missingUrl, user]);

  if (user && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return <p className="text-muted-foreground text-sm">You do not have access to admin.</p>;
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin — policy types</h1>
      <p className="text-muted-foreground text-sm">
        Policy charts are managed via API (<code className="font-mono">POST /admin/policy-charts</code>).
        Listed below are existing types.
      </p>
      {err ? <p className="text-destructive text-sm">{err}</p> : null}
      <ul className="list-inside list-disc text-sm">
        {types.map((t) => (
          <li key={t.id}>
            {t.name} ({t.key}) — {t.chartMode}
          </li>
        ))}
      </ul>
    </div>
  );
}
