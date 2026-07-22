"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { useOfflineStatus } from "@/lib/svkk/offline/use-offline-status";
import {
  canAccessPolicyArchive,
  canPurgePolicy,
  canRestorePolicy,
} from "@/lib/svkk/permissions";
import { AxiosError } from "axios";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ArchivedPolicyRow = {
  id: string;
  deletedAt: string;
  archivedPolicyNo: string | null;
  archivedReferenceNo: string | null;
  village: string | null;
  area: string | null;
  periodYearText?: string | null;
  yearLabel?: string | null;
  displayHolderName?: string;
  holderName: string | null;
  policyType: { id: string; key: string; name: string };
  insuredParty: {
    id: string;
    name: string;
    svkkPublicId: string;
    customerId: string | null;
  };
};

type ArchivedListResponse = {
  items: ArchivedPolicyRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function formatArchivedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function apiErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof AxiosError) {
    const data = e.response?.data as { message?: string; code?: string } | undefined;
    if (data?.message) return data.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

export default function PolicyArchivePage() {
  const { user } = useSvkkAuth();
  const perms = user?.permissions ?? [];
  const { online } = useOfflineStatus();

  const canAccess = canAccessPolicyArchive(perms);
  const canRestore = canRestorePolicy(perms) && online;
  const canPurge = canPurgePolicy(perms) && online;

  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [data, setData] = useState<ArchivedListResponse | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [bulkRestoreOpen, setBulkRestoreOpen] = useState(false);
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected],
  );

  const load = useCallback(async () => {
    if (!canAccess || !online) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) q.set("search", search.trim());
      const res = await svkkJson<ArchivedListResponse>(`/policies/archived?${q.toString()}`);
      setData(res);
      setSelected({});
    } catch (e) {
      toast.error(apiErrorMessage(e, "Could not load Recycle Bin"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [canAccess, online, page, pageSize, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restoreOne(id: string) {
    setActionBusy(true);
    try {
      await svkkJson(`/policies/${id}/restore`, { method: "POST" });
      toast.success("Policy restored");
      setRestoreId(null);
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Restore failed"));
    } finally {
      setActionBusy(false);
    }
  }

  async function purgeOne(id: string) {
    setActionBusy(true);
    try {
      await backendApi.delete(`/policies/${id}/permanent`);
      toast.success("Policy permanently deleted");
      setPurgeId(null);
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Permanent delete failed"));
    } finally {
      setActionBusy(false);
    }
  }

  async function bulkRestore() {
    if (selectedIds.length === 0) return;
    setActionBusy(true);
    try {
      await svkkJson("/policies/bulk-restore", {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds }),
      });
      toast.success(`Restored ${selectedIds.length} polic${selectedIds.length === 1 ? "y" : "ies"}`);
      setBulkRestoreOpen(false);
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Bulk restore failed"));
    } finally {
      setActionBusy(false);
    }
  }

  async function bulkPurge() {
    if (selectedIds.length === 0) return;
    setActionBusy(true);
    try {
      await svkkJson("/policies/bulk-purge", {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds }),
      });
      toast.success(`Permanently deleted ${selectedIds.length} polic${selectedIds.length === 1 ? "y" : "ies"}`);
      setBulkPurgeOpen(false);
      await load();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Bulk permanent delete failed"));
    } finally {
      setActionBusy(false);
    }
  }

  if (!canAccess) {
    return (
      <div className="text-muted-foreground flex min-h-[30vh] items-center justify-center text-sm">
        You do not have permission to view the Recycle Bin.
      </div>
    );
  }

  if (!online) {
    return (
      <div className="text-muted-foreground flex min-h-[30vh] items-center justify-center text-sm">
        Recycle Bin requires an online connection.
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = Math.max(1, data?.totalPages ?? 1);
  const total = data?.total ?? 0;
  const allSelected = items.length > 0 && items.every((r) => selected[r.id]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Recycle Bin</CardTitle>
          <CardDescription>
            Each row is one archived policy year. Restore brings back only that year into its SVKK group. Permanent
            delete cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(searchDraft);
            }}
          >
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search holder, SVKK, policy no, village…"
              className="max-w-md"
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          {(canRestore || canPurge) && selectedIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-sm">{selectedIds.length} selected</span>
              {canRestore ? (
                <Button type="button" size="sm" onClick={() => setBulkRestoreOpen(true)}>
                  Restore selected
                </Button>
              ) : null}
              {canPurge ? (
                <Button type="button" size="sm" variant="destructive" onClick={() => setBulkPurgeOpen(true)}>
                  Permanently delete selected
                </Button>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">No archived policies.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {(canRestore || canPurge) ? (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(v) => {
                            const next = Boolean(v);
                            const map: Record<string, boolean> = {};
                            for (const r of items) map[r.id] = next;
                            setSelected(map);
                          }}
                          aria-label="Select all"
                        />
                      </TableHead>
                    ) : null}
                    <TableHead>Holder</TableHead>
                    <TableHead>SVKK</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Policy No</TableHead>
                    <TableHead>Reference No</TableHead>
                    <TableHead>Village</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Archived</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id}>
                      {(canRestore || canPurge) ? (
                        <TableCell>
                          <Checkbox
                            checked={Boolean(selected[r.id])}
                            onCheckedChange={(v) =>
                              setSelected((prev) => ({ ...prev, [r.id]: Boolean(v) }))
                            }
                            aria-label={`Select ${r.displayHolderName || r.insuredParty.name}`}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell className="font-medium">
                        {r.displayHolderName || r.holderName || r.insuredParty.name}
                      </TableCell>
                      <TableCell>{r.insuredParty.svkkPublicId}</TableCell>
                      <TableCell>{r.yearLabel || r.periodYearText || "—"}</TableCell>
                      <TableCell>{r.archivedPolicyNo || "—"}</TableCell>
                      <TableCell>{r.archivedReferenceNo || "—"}</TableCell>
                      <TableCell>{r.village || "—"}</TableCell>
                      <TableCell>{r.policyType.name || r.policyType.key}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatArchivedAt(r.deletedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canRestore ? (
                            <Button type="button" size="sm" variant="outline" onClick={() => setRestoreId(r.id)}>
                              Restore
                            </Button>
                          ) : null}
                          {canPurge ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => setPurgeId(r.id)}
                            >
                              Delete forever
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            {total === 0 ? "0 archived policies" : `${total} archived polic${total === 1 ? "y" : "ies"}`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="archive-page-size" className="text-muted-foreground whitespace-nowrap text-sm">
                Rows per page
              </Label>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger id="archive-page-size" className="h-8 w-[72px]" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-muted-foreground whitespace-nowrap text-sm">
              Page <span className="text-foreground font-semibold">{page}</span> of{" "}
              <span className="text-foreground font-semibold">{totalPages}</span>
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                className="size-8 p-0"
                onClick={() => setPage(1)}
                disabled={page <= 1 || loading}
              >
                <span className="sr-only">First page</span>
                <ChevronsLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="size-8 p-0"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                <span className="sr-only">Previous</span>
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="size-8 p-0"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
              >
                <span className="sr-only">Next</span>
                <ChevronRight className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="size-8 p-0"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages || loading}
              >
                <span className="sr-only">Last page</span>
                <ChevronsRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>

      <Dialog open={restoreId != null} onOpenChange={(o) => !o && setRestoreId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this policy year?</DialogTitle>
            <DialogDescription>
              Only this archived year will be restored. Restore fails if Policy No, Reference No, or the same year under
              this SVKK is already used by an active policy (for example after recreating that year).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setRestoreId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={actionBusy}
              onClick={() => restoreId && void restoreOne(restoreId)}
            >
              {actionBusy ? "Restoring…" : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={purgeId != null} onOpenChange={(o) => !o && setPurgeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete?</DialogTitle>
            <DialogDescription>
              This permanently removes the policy and related years, members, payments, and receipts. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPurgeId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={actionBusy}
              onClick={() => purgeId && void purgeOne(purgeId)}
            >
              {actionBusy ? "Deleting…" : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkRestoreOpen} onOpenChange={setBulkRestoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore selected policies?</DialogTitle>
            <DialogDescription>
              {selectedIds.length} polic{selectedIds.length === 1 ? "y" : "ies"} will be restored. Conflicts on Policy
              No, Reference No, or a duplicate year under the same SVKK will stop the batch.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setBulkRestoreOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={actionBusy} onClick={() => void bulkRestore()}>
              {actionBusy ? "Restoring…" : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkPurgeOpen} onOpenChange={setBulkPurgeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently delete selected?</DialogTitle>
            <DialogDescription>
              {selectedIds.length} polic{selectedIds.length === 1 ? "y" : "ies"} will be permanently deleted. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setBulkPurgeOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={actionBusy} onClick={() => void bulkPurge()}>
              {actionBusy ? "Deleting…" : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
