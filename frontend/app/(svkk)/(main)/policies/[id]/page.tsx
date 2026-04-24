"use client";

import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import {
  canCreateReceipt,
  canDeletePolicy,
  canUpdatePolicy,
} from "@/lib/svkk/permissions";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type PolicyYear = {
  id: string;
  yearLabel: string;
  sumInsured: unknown;
  policyStart: string | null;
  policyEnd: string | null;
  members: { name: string; relationship: string; dob: string }[];
};

type PolicyDetail = {
  id: string;
  policyNo: string | null;
  village: string | null;
  insuredParty: { svkkPublicId: string; name: string; mobile: string; email: string | null };
  policyType: { name: string };
  years: PolicyYear[];
};

export default function SvkkPolicyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useSvkkAuth();
  const id = String(params.id);

  const [row, setRow] = useState<PolicyDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [village, setVillage] = useState("");
  const [policyNo, setPolicyNo] = useState("");
  const [saving, setSaving] = useState(false);
  const [receiptAmt, setReceiptAmt] = useState("");
  const [receiptMode, setReceiptMode] = useState("CASH");
  const [yearId, setYearId] = useState<string | "">("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const missingUrl = !getSvkkApiBase();

  const role = user?.role;
  const canPatch = role ? canUpdatePolicy(role) : false;
  const canDel = role ? canDeletePolicy(role) : false;
  const canRcpt = role ? canCreateReceipt(role) : false;

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    void (async () => {
      try {
        const p = await svkkJson<PolicyDetail>(`/policies/${id}`);
        setRow(p);
        setVillage(p.village ?? "");
        setPolicyNo(p.policyNo ?? "");
        if (p.years[0]) {
          setYearId(p.years[0].id);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Not found");
      }
    })();
  }, [id, missingUrl]);

  async function savePolicy() {
    if (!row) {
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        village: village.trim() || null,
        policyNo: policyNo.trim() || null,
      };
      const updated = await svkkJson<PolicyDetail>(`/policies/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setRow(updated);
      toast.success("Policy updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function issueReceipt() {
    const amt = Number(receiptAmt);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setReceiptBusy(true);
    try {
      const res = await svkkJson<{ receiptNo: string }>(`/receipts/policies/${id}`, {
        method: "POST",
        body: JSON.stringify({
          amount: amt,
          paymentMode: receiptMode || null,
          policyYearId: yearId || null,
        }),
      });
      toast.success(`Receipt ${res.receiptNo} created (PDF saved on server).`);
      setReceiptAmt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Receipt failed");
    } finally {
      setReceiptBusy(false);
    }
  }

  async function deletePolicy() {
    setDeleteBusy(true);
    try {
      await backendApi.delete(`/policies/${id}`);
      toast.success("Policy deleted");
      setConfirmDeleteOpen(false);
      router.replace("/policies");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }
  if (err) {
    return <p className="text-destructive text-sm">{err}</p>;
  }
  if (!row) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/policies">Back</Link>
        </Button>
        <h1 className="text-2xl font-semibold">Policy</h1>
      </div>
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">SVKK ID: </span>
          <span className="font-mono">{row.insuredParty.svkkPublicId}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Name: </span>
          {row.insuredParty.name}
        </p>
        <p>
          <span className="text-muted-foreground">Type: </span>
          {row.policyType.name}
        </p>
      </div>

      {canPatch ? (
        <div className="bg-muted/30 max-w-md space-y-3 rounded-lg border p-4">
          <h2 className="font-medium">Edit policy fields</h2>
          <div className="space-y-2">
            <Label>Village</Label>
            <Input value={village} onChange={(e) => setVillage(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Policy number</Label>
            <Input value={policyNo} onChange={(e) => setPolicyNo(e.target.value)} />
          </div>
          <Button type="button" size="sm" disabled={saving} onClick={() => void savePolicy()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}

      {canRcpt ? (
        <div className="bg-muted/30 max-w-md space-y-3 rounded-lg border p-4">
          <h2 className="font-medium">Issue receipt</h2>
          <p className="text-muted-foreground text-xs">
            Creates a receipt record and PDF on the server (paths returned in API for ops use).
          </p>
          {row.years.length > 1 ? (
            <div className="space-y-2">
              <Label>Policy year</Label>
              <Select value={yearId} onValueChange={setYearId}>
                <SelectTrigger>
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {row.years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.yearLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Amount (INR)</Label>
            <Input
              value={receiptAmt}
              onChange={(e) => setReceiptAmt(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="space-y-2">
            <Label>Payment mode</Label>
            <Select value={receiptMode} onValueChange={setReceiptMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">CASH</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="NEFT">NEFT</SelectItem>
                <SelectItem value="CHQ">CHQ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="sm" disabled={receiptBusy} onClick={() => void issueReceipt()}>
            {receiptBusy ? "Submitting…" : "Create receipt"}
          </Button>
        </div>
      ) : null}

      {canDel ? (
        <>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={deleteBusy}
            onClick={() => setConfirmDeleteOpen(true)}
          >
            Delete policy
          </Button>
          <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this policy?</DialogTitle>
                <DialogDescription>
                  This cannot be undone. Only administrators can delete policies.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmDeleteOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteBusy}
                  onClick={() => void deletePolicy()}
                >
                  {deleteBusy ? "Deleting…" : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-lg font-medium">Years</h2>
        {row.years.map((y) => (
          <div key={y.id} className="bg-muted/40 rounded-md border p-3 text-sm">
            <p className="font-medium">{y.yearLabel}</p>
            <p className="text-muted-foreground">Members: {y.members.length}</p>
            <ul className="mt-1 list-inside list-disc">
              {y.members.map((m) => (
                <li key={m.name + m.dob}>
                  {m.name} — {m.relationship}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
