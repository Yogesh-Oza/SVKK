"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  canDeletePolicy,
  canUpdatePolicy,
} from "@/lib/svkk/permissions";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import type { PolicyDetailForReceipt } from "@/lib/svkk/policy-receipt-print";
import { openPolicyReceiptPrint } from "@/lib/svkk/policy-receipt-print";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ListPolicy = {
  id: string;
  policyNo: string | null;
  referenceNo: string | null;
  village: string | null;
  personsInsuredCount: number | null;
  area: string | null;
  remarks: string | null;
  adProductVariant?: string | null;
  periodYearText?: string | null;
  periodMonthText?: string | null;
  insuredParty: {
    svkkPublicId: string;
    name: string;
    mobile: string;
    customerId: string | null;
    pan: string | null;
  };
  policyType: { id: string; name: string };
  category: { id: string; key: string; name: string } | null;
  years: Array<{
    yearLabel: string;
    sumInsured: unknown;
    vkkPremium: unknown;
    expectedNetPremium: unknown;
  }>;
};

type PageListRes = {
  items: ListPolicy[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type FiltersMeta = {
  villages: string[];
  areas: string[];
  sumInsuredValues: string[];
  periodYearTexts: string[];
  periodMonthTexts: string[];
};

type CategoryItem = { id: string; key: string; name: string };
type PolicyTypeItem = { id: string; key: string; name: string };

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "createdAt", label: "Newest first" },
  { value: "createdAt_asc", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "village", label: "Village A–Z" },
  { value: "policyNo", label: "Policy no. A–Z" },
  { value: "referenceNo", label: "Reference no. A–Z" },
];

function sumLabel(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && v !== null && "toString" in v) {
    return (v as { toString: () => string }).toString();
  }
  return "—";
}

export default function SvkkPoliciesPage() {
  const { user } = useSvkkAuth();
  const role = user?.role;
  const canDel = role ? canDeletePolicy(role) : false;
  const canEdit = role ? canUpdatePolicy(role) : false;

  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [village, setVillage] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [periodYearText, setPeriodYearText] = useState("");
  const [periodMonthText, setPeriodMonthText] = useState("");
  const [categoryIdState, setCategoryIdState] = useState("");
  const [policyTypeId, setPolicyTypeId] = useState("");
  const [adVariant, setAdVariant] = useState<string>("");
  const [area, setArea] = useState("");
  const [sumInsured, setSumInsured] = useState("");
  const [policyGrouping, setPolicyGrouping] = useState<string>("");
  const [chequeStatus, setChequeStatus] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterYear, setFilterYear] = useState<string>("");
  const [sort, setSort] = useState("createdAt");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [rows, setRows] = useState<ListPolicy[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [meta, setMeta] = useState<FiltersMeta | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [policyTypes, setPolicyTypes] = useState<PolicyTypeItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [rowDeleteId, setRowDeleteId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);

  const missingUrl = !getSvkkApiBase();

  const queryString = useMemo(() => {
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("pageSize", String(pageSize));
    q.set("sort", sort);
    if (searchApplied.trim()) q.set("search", searchApplied.trim());
    if (village.trim()) q.set("village", village.trim());
    if (yearLabel.trim()) q.set("yearLabel", yearLabel.trim());
    if (periodYearText) q.set("periodYearText", periodYearText);
    if (periodMonthText) q.set("periodMonthText", periodMonthText);
    if (categoryIdState) q.set("categoryId", categoryIdState);
    if (policyTypeId) q.set("policyTypeId", policyTypeId);
    if (adVariant) q.set("adProductVariant", adVariant);
    if (area.trim()) q.set("area", area.trim());
    if (sumInsured) q.set("sumInsured", sumInsured);
    if (policyGrouping) q.set("policyGrouping", policyGrouping);
    if (chequeStatus) q.set("chequeStatus", chequeStatus);
    if (filterMonth && filterYear) {
      const m = Number(filterMonth);
      const y = Number(filterYear);
      if (m >= 1 && m <= 12 && y >= 1990) {
        q.set("month", String(m));
        q.set("year", String(y));
      }
    }
    return q.toString();
  }, [
    page,
    pageSize,
    sort,
    searchApplied,
    village,
    yearLabel,
    periodYearText,
    periodMonthText,
    categoryIdState,
    policyTypeId,
    adVariant,
    area,
    sumInsured,
    policyGrouping,
    chequeStatus,
    filterMonth,
    filterYear,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setErr(null);
      const res = await svkkJson<PageListRes>(`/policies?${queryString}`);
      setRows(res.items);
      setTotalPages(res.totalPages);
      setTotal(res.total);
      setSelected(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    if (missingUrl) return;
    void load();
  }, [missingUrl, load]);

  useEffect(() => {
    if (missingUrl) return;
    void (async () => {
      try {
        const f = await svkkJson<FiltersMeta>("/policies/filters");
        setMeta(f);
        const cat = await svkkJson<{ items: CategoryItem[] }>("/categories");
        setCategories(cat.items);
        const pt = await svkkJson<PolicyTypeItem[]>(
          "/calculation/reference/policy-types",
        );
        setPolicyTypes(pt);
      } catch {
        /* non-fatal */
      }
    })();
  }, [missingUrl]);

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(rows.map((r) => r.id)));
    } else {
      setSelected(new Set());
    }
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setActionBusy(true);
    try {
      await svkkJson("/policies/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      toast.success(`Deleted ${ids.length} polic${ids.length === 1 ? "y" : "ies"}`);
      setBulkOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk delete failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteOne(id: string) {
    setActionBusy(true);
    try {
      await backendApi.delete(`/policies/${id}`);
      toast.success("Policy deleted");
      setRowDeleteId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function printReceiptForRow(id: string) {
    setReceiptBusyId(id);
    try {
      const p = await svkkJson<PolicyDetailForReceipt>(`/policies/${id}`);
      openPolicyReceiptPrint(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load policy for receipt");
    } finally {
      setReceiptBusyId(null);
    }
  }

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setSearchApplied(searchDraft.trim());
    setPage(1);
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-semibold">Policies</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="default" asChild>
            <Link href="/policies/new">Add policy</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/calculator">Premium calculator</Link>
          </Button>
        </div>
      </div>

      <form onSubmit={applyFilters} className="space-y-4 rounded-lg border bg-muted/20 p-4">
        <h2 className="text-sm font-medium">Filter &amp; search</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="sm:col-span-2">
            <Label className="text-xs">Search</Label>
            <Input
              placeholder="Name, customer ID, village, ref no, phone, bank, nominee, PAN…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Sort</Label>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Village</Label>
            <Select value={village || "__all__"} onValueChange={(v) => setVillage(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All villages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All villages</SelectItem>
                {(meta?.villages ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Fiscal year (label)</Label>
            <Input
              placeholder="e.g. 2025-26"
              value={yearLabel}
              onChange={(e) => setYearLabel(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Policy year (period)</Label>
            <Select value={periodYearText || "__all__"} onValueChange={(v) => setPeriodYearText(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {(meta?.periodYearTexts ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Month (period text)</Label>
            <Select value={periodMonthText || "__all__"} onValueChange={(v) => setPeriodMonthText(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {(meta?.periodMonthTexts ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={categoryIdState || "__all__"} onValueChange={(v) => setCategoryIdState(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.key} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Product (AD)</Label>
            <Select value={adVariant || "__all__"} onValueChange={(v) => setAdVariant(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="FAMILY_FLOATER">Family floater</SelectItem>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="ASHA_KIRAN">Asha Kiran</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Policy type (chart)</Label>
            <Select value={policyTypeId || "__all__"} onValueChange={(v) => setPolicyTypeId(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {policyTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Area</Label>
            <Select value={area || "__all__"} onValueChange={(v) => setArea(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {(meta?.areas ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sum insured</Label>
            <Select value={sumInsured || "__all__"} onValueChange={(v) => setSumInsured(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {(meta?.sumInsuredValues ?? []).map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Policy grouping</Label>
            <Select value={policyGrouping || "__all__"} onValueChange={(v) => setPolicyGrouping(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {["SVKK", "NVKK", "RTY", "OTHER"].map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Cheque status</Label>
            <Select value={chequeStatus || "__all__"} onValueChange={(v) => setChequeStatus(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {["CLEARED", "DISHONOURED", "PENDING", "PAID", "UNPAID"].map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Created in month (optional)</Label>
            <div className="flex gap-2">
              <Select value={filterMonth || "__m__"} onValueChange={(v) => setFilterMonth(v === "__m__" ? "" : v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__m__">—</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="w-24"
                placeholder="Year"
                inputMode="numeric"
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Loading…" : "Apply"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearchDraft("");
              setSearchApplied("");
              setVillage("");
              setYearLabel("");
              setPeriodYearText("");
              setPeriodMonthText("");
              setCategoryIdState("");
              setPolicyTypeId("");
              setAdVariant("");
              setArea("");
              setSumInsured("");
              setPolicyGrouping("");
              setChequeStatus("");
              setFilterMonth("");
              setFilterYear("");
              setSort("createdAt");
              setPage(1);
            }}
          >
            Reset
          </Button>
        </div>
      </form>

      {canDel && selected.size > 0 ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="destructive" size="sm" onClick={() => setBulkOpen(true)}>
            Delete selected ({selected.size})
          </Button>
        </div>
      ) : null}

      {err ? <p className="text-destructive text-sm">{err}</p> : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {canDel ? (
                <TableHead className="w-10">
                  <Checkbox
                    checked={rows.length > 0 && selected.size === rows.length}
                    onCheckedChange={(c) => toggleAll(c === true)}
                    aria-label="Select all"
                  />
                </TableHead>
              ) : null}
              <TableHead>Name</TableHead>
              <TableHead>Customer ID</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Policy type</TableHead>
              <TableHead>Sum insured</TableHead>
              <TableHead>Village</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const y0 = p.years[0];
              return (
                <TableRow key={p.id}>
                  {canDel ? (
                    <TableCell>
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={(c) => toggleOne(p.id, c === true)}
                        aria-label={`Select ${p.insuredParty.name}`}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell className="font-medium">{p.insuredParty.name}</TableCell>
                  <TableCell className="font-mono text-sm">{p.insuredParty.customerId ?? "—"}</TableCell>
                  <TableCell>{p.category?.key ?? "—"}</TableCell>
                  <TableCell>{p.policyType.name}</TableCell>
                  <TableCell>{y0 ? sumLabel(y0.sumInsured) : "—"}</TableCell>
                  <TableCell>{p.village ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{p.insuredParty.mobile}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/policies/${p.id}`}>View</Link>
                      </Button>
                      {canEdit ? (
                        <Button variant="secondary" size="sm" asChild>
                          <Link href={`/policies/${p.id}`}>Edit</Link>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={receiptBusyId === p.id}
                        onClick={() => void printReceiptForRow(p.id)}
                      >
                        {receiptBusyId === p.id ? "…" : "Receipt"}
                      </Button>
                      {canDel ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setRowDeleteId(p.id)}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {rows.length === 0 && !loading ? (
        <p className="text-muted-foreground text-sm">No policies found.</p>
      ) : null}

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted-foreground">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(1)}>
              First
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              Last
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected policies?</DialogTitle>
            <DialogDescription>
              This will soft-delete {selected.size} polic{selected.size === 1 ? "y" : "ies"}. This action is reserved for
              administrators.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={actionBusy} onClick={() => void bulkDelete()}>
              {actionBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rowDeleteId != null} onOpenChange={(o) => !o && setRowDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this policy?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setRowDeleteId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={actionBusy}
              onClick={() => rowDeleteId && void deleteOne(rowDeleteId)}
            >
              {actionBusy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
