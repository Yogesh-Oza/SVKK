"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { useCallback, useEffect, useState } from "react";

type Claim = {
  id: string;
  claimNo: string;
  svkkPublicId: string;
  policyYear: string;
  status: string;
  claimAmount: string | null;
  village: string | null;
};

export default function SvkkClaimsPage() {
  const { user } = useSvkkAuth();
  const [rows, setRows] = useState<Claim[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [village, setVillage] = useState("");
  const missingUrl = !getSvkkApiBase();

  const load = useCallback(async () => {
    const q = new URLSearchParams({ limit: "100" });
    if (village.trim()) {
      q.set("village", village.trim());
    }
    const res = await svkkJson<{ items: Claim[] }>(`/claims?${q.toString()}`);
    setRows(res.items);
  }, [village]);

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    if (
      !user ||
      (user.role !== "SUPERVISOR" && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")
    ) {
      return;
    }
    void (async () => {
      try {
        setErr(null);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, [missingUrl, user, load]);

  if (
    user &&
    user.role !== "SUPERVISOR" &&
    user.role !== "ADMIN" &&
    user.role !== "SUPER_ADMIN"
  ) {
    return <p className="text-muted-foreground text-sm">You do not have access to claims.</p>;
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Claims</h1>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input
          className="border-input bg-background ring-offset-background max-w-xs rounded-md border px-3 py-2 text-sm"
          placeholder="Village"
          value={village}
          onChange={(e) => setVillage(e.target.value)}
        />
        <button
          type="submit"
          className="bg-secondary text-secondary-foreground inline-flex rounded-md px-3 py-2 text-sm"
        >
          Filter
        </button>
      </form>
      {err ? <p className="text-destructive text-sm">{err}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Claim #</TableHead>
            <TableHead>SVKK</TableHead>
            <TableHead>Year</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Village</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs">{c.claimNo}</TableCell>
              <TableCell className="font-mono text-xs">{c.svkkPublicId}</TableCell>
              <TableCell>{c.policyYear}</TableCell>
              <TableCell>{c.status}</TableCell>
              <TableCell>{c.claimAmount ?? "—"}</TableCell>
              <TableCell>{c.village ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
