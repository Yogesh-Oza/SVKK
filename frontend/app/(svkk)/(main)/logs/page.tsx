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

type LogRow = {
  id: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
};

export default function SvkkLogsPage() {
  const { user } = useSvkkAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const missingUrl = !getSvkkApiBase();

  const load = useCallback(async () => {
    const res = await svkkJson<{ items: LogRow[] }>("/logs?limit=50");
    setRows(res.items);
  }, []);

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    if (user && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return;
    }
    void (async () => {
      try {
        setErr(null);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [missingUrl, user, load]);

  if (user && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return <p className="text-muted-foreground text-sm">You do not have access to activity logs.</p>;
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Activity logs</h1>
      {err ? <p className="text-destructive text-sm">{err}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Module</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{new Date(r.createdAt).toLocaleString()}</TableCell>
              <TableCell>{r.module}</TableCell>
              <TableCell>{r.action}</TableCell>
              <TableCell className="max-w-[12rem] truncate text-xs">
                {r.entityType} {r.entityId}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
