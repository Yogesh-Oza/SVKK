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
import { adProductFormValueFromApi } from "@/features/svkk-policies/ad-product-variant";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import type { PolicyDetailForReceipt } from "@/lib/svkk/policy-receipt-print";
import { openPolicyReceiptPrint } from "@/lib/svkk/policy-receipt-print";
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
  vkkPremium: unknown;
  policyStart: string | null;
  policyEnd: string | null;
  bankName: string | null;
  holderCumulativeBonus: unknown;
  holderJoiningYear: string | null;
  members: { name: string; relationship: string; dob: string }[];
  payments?: Array<{
    cheque: {
      number: string;
      bankName: string;
    } | null;
  }>;
};

type PolicyDetail = {
  id: string;
  policyNo: string | null;
  referenceNo: string | null;
  village: string | null;
  area: string | null;
  remarks: string | null;
  adProductVariant: string | null;
  personsInsuredCount: number | null;
  insuranceCompany: string | null;
  tpa: string | null;
  periodYearText: string | null;
  periodMonthText: string | null;
  policyGrouping: string | null;
  policyUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine4: string | null;
  city: string | null;
  pincode: string | null;
  contactPhone: string | null;
  nomineeName: string | null;
  nomineeRelation: string | null;
  updatedAt: string;
  insuredParty: {
    svkkPublicId: string;
    name: string;
    mobile: string;
    email: string | null;
    customerId: string | null;
    pan: string | null;
    dateOfBirth: string | null;
  };
  policyType: { name: string };
  category: { key: string; name: string } | null;
  years: PolicyYear[];
};

export default function SvkkPolicyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useSvkkAuth();
  const id = String(params.id);

  const [row, setRow] = useState<PolicyDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [receiptAmt, setReceiptAmt] = useState("");
  const [receiptMode, setReceiptMode] = useState("CASH");
  const [yearId, setYearId] = useState<string | "">("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptPrintBusy, setReceiptPrintBusy] = useState(false);
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
        if (p.years[0]) {
          setYearId(p.years[0].id);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Not found");
      }
    })();
  }, [id, missingUrl]);

  function printLegacyReceipt() {
    if (!row) return;
    setReceiptPrintBusy(true);
    try {
      openPolicyReceiptPrint(row as PolicyDetailForReceipt);
    } finally {
      setReceiptPrintBusy(false);
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={receiptPrintBusy}
          onClick={() => printLegacyReceipt()}
        >
          {receiptPrintBusy ? "…" : "Print receipt (PDF-style)"}
        </Button>
        {canPatch ? (
          <Button type="button" size="sm" asChild>
            <Link href={`/policies/${id}/edit`}>Edit policy</Link>
          </Button>
        ) : null}
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

      {(() => {
        const y = row.years[0];
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Policy details</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy number</TableHead>
                      <TableHead>Policy type</TableHead>
                      <TableHead>Customer ID</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>SVKK ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-mono text-sm">{row.policyNo ?? "—"}</TableCell>
                      <TableCell>{row.policyType.name}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.insuredParty.customerId ?? "—"}
                      </TableCell>
                      <TableCell>{row.category?.key ?? "—"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.insuredParty.svkkPublicId}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Insurance company</TableHead>
                      <TableHead>TPA</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Persons insured</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>{row.insuranceCompany ?? "—"}</TableCell>
                      <TableCell>{row.tpa ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {y?.policyStart
                          ? new Date(y.policyStart).toLocaleDateString("en-IN")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {y?.policyEnd
                          ? new Date(y.policyEnd).toLocaleDateString("en-IN")
                          : "—"}
                      </TableCell>
                      <TableCell>{row.personsInsuredCount ?? "—"}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sum insured</TableHead>
                      <TableHead>Cumulative bonus</TableHead>
                      <TableHead>Joining</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead>Month</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>{y ? String(y.sumInsured ?? "—") : "—"}</TableCell>
                      <TableCell>
                        {y ? String(y.holderCumulativeBonus ?? "—") : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{y?.holderJoiningYear ?? "—"}</TableCell>
                      <TableCell>{row.periodYearText ?? "—"}</TableCell>
                      <TableCell>{row.periodMonthText ?? "—"}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy grouping</TableHead>
                      <TableHead>Policy URL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>{row.policyGrouping ?? "—"}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm">
                        {row.policyUrl ?? "—"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Personal information</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Policy holder</TableHead>
                      <TableHead>PAN</TableHead>
                      <TableHead>Village</TableHead>
                      <TableHead>DOB</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>{row.insuredParty.name}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.insuredParty.pan ?? "—"}
                      </TableCell>
                      <TableCell>{row.village ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {row.insuredParty.dateOfBirth
                          ? new Date(row.insuredParty.dateOfBirth).toLocaleDateString("en-IN")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>Address (2–4)</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead>City / PIN</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="max-w-[10rem] text-sm">
                        {row.addressLine1 ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[12rem] text-sm">
                        {[row.addressLine2, row.addressLine3, row.addressLine4]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </TableCell>
                      <TableCell>{row.area ?? "—"}</TableCell>
                      <TableCell>
                        {[row.city, row.pincode].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Primary mobile</TableHead>
                      <TableHead>Contact phone</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-mono text-sm">
                        {row.insuredParty.mobile}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.contactPhone ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">{row.insuredParty.email ?? "—"}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nominee</TableHead>
                      <TableHead>Relation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>{row.nomineeName ?? "—"}</TableCell>
                      <TableCell>{row.nomineeRelation ?? "—"}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        );
      })()}

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
