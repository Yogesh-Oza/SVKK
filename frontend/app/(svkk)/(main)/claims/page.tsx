"use client";

import { Button } from "@/components/ui/button";
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
import { getSvkkApiBase } from "@/lib/svkk/config";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import {
  canCreateClaim,
  canDeleteClaim,
  canUpdateClaim,
} from "@/lib/svkk/permissions";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const CLAIM_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
type ClaimStatus = (typeof CLAIM_STATUSES)[number];

type Claim = {
  id: string;
  claimNo: string;
  svkkPublicId: string;
  policyYear: string;
  status: string;
  claimAmount: string | null;
  approvedAmount: string | null;
  village: string | null;
  patientName: string | null;
};

function parseOptionalAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function SvkkClaimsPage() {
  const { user } = useSvkkAuth();
  const [rows, setRows] = useState<Claim[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [village, setVillage] = useState("");
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const cursorRef = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [createBusy, setCreateBusy] = useState(false);
  const [newClaimNo, setNewClaimNo] = useState("");
  const [newSvkk, setNewSvkk] = useState("");
  const [newPolicyYear, setNewPolicyYear] = useState("");
  const [newVillage, setNewVillage] = useState("");
  const [newPatient, setNewPatient] = useState("");
  const [newClaimAmount, setNewClaimAmount] = useState("");
  const [newPolicyId, setNewPolicyId] = useState("");

  const [edit, setEdit] = useState<Claim | null>(null);
  const [editStatus, setEditStatus] = useState<ClaimStatus>("PENDING");
  const [editApproved, setEditApproved] = useState("");
  const [patchBusy, setPatchBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [claimToDelete, setClaimToDelete] = useState<Claim | null>(null);

  const missingUrl = !getSvkkApiBase();
  const role = user?.role;
  const canC = role ? canCreateClaim(role) : false;
  const canU = role ? canUpdateClaim(role) : false;
  const canD = role ? canDeleteClaim(role) : false;
  const supervisorVillageRequired = role === "SUPERVISOR";

  const fetchPage = useCallback(
    async (opts: { reset: boolean; cursor?: string }) => {
      const q = new URLSearchParams({ limit: "30" });
      if (village.trim()) {
        q.set("village", village.trim());
      }
      if (opts.cursor) {
        q.set("cursor", opts.cursor);
      }
      return svkkJson<{ items: Claim[]; nextCursor?: string }>(`/claims?${q.toString()}`);
    },
    [village],
  );

  const runInitialLoad = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchPage({ reset: true });
      setRows(res.items);
      setNextCursor(res.nextCursor);
      cursorRef.current = res.nextCursor;
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

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
    void runInitialLoad();
  }, [missingUrl, user, runInitialLoad]);

  async function loadMore() {
    const c = cursorRef.current;
    if (!c) {
      return;
    }
    setLoadingMore(true);
    try {
      const res = await fetchPage({ reset: false, cursor: c });
      setRows((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      cursorRef.current = res.nextCursor;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }

  function openEdit(c: Claim) {
    setEdit(c);
    setEditStatus(
      CLAIM_STATUSES.includes(c.status as ClaimStatus) ? (c.status as ClaimStatus) : "PENDING",
    );
    setEditApproved(c.approvedAmount != null ? String(c.approvedAmount) : "");
  }

  async function saveEdit() {
    if (!edit) {
      return;
    }
    setPatchBusy(true);
    try {
      const approvedParsed = parseOptionalAmount(editApproved);
      if (editApproved.trim() && approvedParsed === null) {
        toast.error("Approved amount must be a non‑negative number or empty");
        return;
      }
      const body: { status: ClaimStatus; approvedAmount: number | null } = {
        status: editStatus,
        approvedAmount: approvedParsed,
      };
      const updated = await svkkJson<Claim>(`/claims/${edit.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      toast.success("Claim updated");
      setEdit(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setPatchBusy(false);
    }
  }

  async function createClaim() {
    if (!newClaimNo.trim() || !newSvkk.trim() || !newPolicyYear.trim()) {
      toast.error("Claim number, SVKK public ID, and policy year are required");
      return;
    }
    if (supervisorVillageRequired && !newVillage.trim()) {
      toast.error("Village is required for your role");
      return;
    }
    const amt = parseOptionalAmount(newClaimAmount);
    if (newClaimAmount.trim() && amt === null) {
      toast.error("Claim amount must be a non‑negative number or empty");
      return;
    }
    setCreateBusy(true);
    try {
      const body: Record<string, unknown> = {
        claimNo: newClaimNo.trim(),
        svkkPublicId: newSvkk.trim(),
        policyYear: newPolicyYear.trim(),
        status: "PENDING",
        village: newVillage.trim() || null,
        patientName: newPatient.trim() || null,
        claimAmount: amt,
        policyId: newPolicyId.trim() || null,
      };
      await svkkJson("/claims", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success("Claim created");
      setNewClaimNo("");
      setNewSvkk("");
      setNewPolicyYear("");
      setNewVillage("");
      setNewPatient("");
      setNewClaimAmount("");
      setNewPolicyId("");
      void runInitialLoad();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreateBusy(false);
    }
  }

  async function removeClaim() {
    if (!claimToDelete) {
      return;
    }
    const id = claimToDelete.id;
    setDeleteBusy(true);
    try {
      await backendApi.delete(`/claims/${id}`);
      toast.success("Claim deleted");
      setRows((prev) => prev.filter((r) => r.id !== id));
      setClaimToDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

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
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Claims</h1>

      {canC ? (
        <div className="bg-muted/30 max-w-2xl space-y-3 rounded-lg border p-4">
          <h2 className="font-medium">New claim</h2>
          {supervisorVillageRequired ? (
            <p className="text-muted-foreground text-xs">Village is required for supervisors.</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Claim number</Label>
              <Input value={newClaimNo} onChange={(e) => setNewClaimNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>SVKK public ID</Label>
              <Input value={newSvkk} onChange={(e) => setNewSvkk(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Policy year</Label>
              <Input
                placeholder="e.g. 2024-25"
                value={newPolicyYear}
                onChange={(e) => setNewPolicyYear(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Village {supervisorVillageRequired ? "" : "(optional)"}</Label>
              <Input value={newVillage} onChange={(e) => setNewVillage(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Patient name (optional)</Label>
              <Input value={newPatient} onChange={(e) => setNewPatient(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Claim amount (INR, optional)</Label>
              <Input
                value={newClaimAmount}
                onChange={(e) => setNewClaimAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Policy ID (optional, internal UUID)</Label>
              <Input
                className="font-mono text-xs"
                value={newPolicyId}
                onChange={(e) => setNewPolicyId(e.target.value)}
              />
            </div>
          </div>
          <Button type="button" size="sm" disabled={createBusy} onClick={() => void createClaim()}>
            {createBusy ? "Creating…" : "Create claim"}
          </Button>
        </div>
      ) : null}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runInitialLoad();
        }}
      >
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">Village</Label>
          <Input
            className="max-w-xs"
            placeholder="Filter by village"
            value={village}
            onChange={(e) => setVillage(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={loading}>
          {loading ? "Loading…" : "Apply filter"}
        </Button>
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
            <TableHead>Approved</TableHead>
            <TableHead>Village</TableHead>
            {(canU || canD) && <TableHead className="text-right">Actions</TableHead>}
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
              <TableCell>{c.approvedAmount ?? "—"}</TableCell>
              <TableCell>{c.village ?? "—"}</TableCell>
              {canU || canD ? (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {canU ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => openEdit(c)}>
                        Edit
                      </Button>
                    ) : null}
                    {canD ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setClaimToDelete(c)}
                      >
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {nextCursor ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      <Dialog
        open={!!claimToDelete}
        onOpenChange={(o) => {
          if (!o) {
            setClaimToDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this claim?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Deleting claims is limited to administrators.
              {claimToDelete ? (
                <span className="mt-2 block font-mono text-xs">{claimToDelete.claimNo}</span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setClaimToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => void removeClaim()}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update claim</DialogTitle>
            <DialogDescription>
              Change status and approved amount. Setting status to Approved records you as the approver
              on the server.
            </DialogDescription>
          </DialogHeader>
          {edit ? (
            <div className="space-y-3 py-1">
              <p className="text-muted-foreground font-mono text-xs">{edit.claimNo}</p>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as ClaimStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLAIM_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Approved amount (INR)</Label>
                <Input
                  value={editApproved}
                  onChange={(e) => setEditApproved(e.target.value)}
                  inputMode="decimal"
                  placeholder="Leave empty to clear"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={patchBusy} onClick={() => void saveEdit()}>
              {patchBusy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
