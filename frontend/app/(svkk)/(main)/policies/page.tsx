"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type PolicyRow = {
  id: string;
  policyNo: string | null;
  village: string | null;
  createdAt: string;
  insuredParty: { svkkPublicId: string; name: string; mobile: string };
  policyType: { name: string };
};

type ListRes = { items: PolicyRow[]; nextCursor?: string };

export default function SvkkPoliciesPage() {
  const [search, setSearch] = useState("");
  const [village, setVillage] = useState("");
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const missingUrl = !getSvkkApiBase();

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (search.trim()) {
      q.set("search", search.trim());
    }
    if (village.trim()) {
      q.set("village", village.trim());
    }
    q.set("limit", "50");
    const res = await svkkJson<ListRes>(`/policies?${q.toString()}`);
    setRows(res.items);
  }, [search, village]);

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    void (async () => {
      try {
        setErr(null);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load policies");
      }
    })();
  }, [missingUrl, load]);

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold">Policies</h1>
        <Button asChild>
          <Link href="/calculator">Open premium calculator</Link>
        </Button>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <Input
          placeholder="Search (name, mobile, SVKK ID, policy no.)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <Input
          placeholder="Village filter"
          value={village}
          onChange={(e) => setVillage(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      {err ? <p className="text-destructive text-sm">{err}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SVKK ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Village</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-sm">{p.insuredParty.svkkPublicId}</TableCell>
              <TableCell>{p.insuredParty.name}</TableCell>
              <TableCell>{p.policyType.name}</TableCell>
              <TableCell>{p.village ?? "—"}</TableCell>
              <TableCell>
                <Button variant="link" className="p-0" asChild>
                  <Link href={`/policies/${p.id}`}>View</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 ? <p className="text-muted-foreground text-sm">No policies found.</p> : null}
    </div>
  );
}
