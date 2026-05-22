"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adProductFormValueFromApi } from "@/features/svkk-policies/ad-product-variant";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import {
  canDeletePolicy,
  canUpdatePolicy,
} from "@/lib/svkk/permissions";
import {
  PolicyDetailViewBody,
  type PolicyDetailViewRow,
} from "@/features/svkk-policies/policy-detail-view-body";
import {
  displayVal,
  formatViewDateDmy,
} from "@/features/svkk-policies/policy-detail-view-helpers";
import {
  fetchPolicyYearSiblings,
  singleRowYearSibling,
  type PolicyListYearSibling,
} from "@/features/svkk-policies/policy-year-siblings";
import { yearChipLabel } from "@/features/svkk-policies/policy-year-display";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type PolicyDetail = PolicyDetailViewRow & {
  id: string;
  updatedAt: string;
  createdAt?: string | null;
};

function formatInrRupee(v: unknown): string | null {
  const s =
    v == null || v === ""
      ? ""
      : typeof v === "object" && v !== null && "toString" in v
        ? (v as { toString: () => string }).toString()
        : String(v);
  const cleaned = s.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  const formatted = Number.isFinite(n) ? n.toLocaleString("en-IN") : cleaned;
  return `₹ ${formatted}`;
}

async function loadPolicyById(policyId: string): Promise<PolicyDetail> {
  return svkkJson<PolicyDetail>(`/policies/${policyId}`);
}

export default function SvkkPolicyDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useSvkkAuth();
  const id = String(params.id);
  const selectedYearLabel = searchParams.get("year")?.trim() ?? "";

  const [row, setRow] = useState<PolicyDetail | null>(null);
  const [yearTabs, setYearTabs] = useState<PolicyListYearSibling[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [yearId, setYearId] = useState<string | "">("");
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [switchingYear, setSwitchingYear] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const missingUrl = !getSvkkApiBase();

  const perms = user?.permissions ?? [];
  const canDel = canDeletePolicy(perms);
  const canEdit = canUpdatePolicy(perms);

  const applyYearToDetail = useCallback((detail: PolicyDetail, yearLabel: string) => {
    const matched =
      detail.years.find((yy) => yy.yearLabel === yearLabel) ??
      (detail.periodYearText?.trim() === yearLabel ? detail.years[0] : undefined);
    setYearId(matched?.id ?? detail.years[0]?.id ?? "");
  }, []);

  useEffect(() => {
    if (missingUrl) return;
    let cancelled = false;
    void (async () => {
      if (!row) setLoadingDetail(true);
      else setSwitchingYear(true);
      setErr(null);
      try {
        const initial = await loadPolicyById(id);
        if (cancelled) return;

        const svkkId = initial.insuredParty.svkkPublicId.trim();
        let tabs: PolicyListYearSibling[] = [];
        if (svkkId) {
          tabs = await fetchPolicyYearSiblings(svkkId);
        }
        if (tabs.length === 0) {
          tabs = singleRowYearSibling({
            id: initial.id,
            policyNo: initial.policyNo,
            referenceNo: initial.referenceNo,
            periodYearText: initial.periodYearText,
            insuredParty: initial.insuredParty,
            years: initial.years.map((yy) => ({
              yearLabel: yy.yearLabel,
              vkkPremium: yy.vkkPremium,
              sumInsured: yy.sumInsured,
            })),
          });
        }
        if (cancelled) return;
        setYearTabs(tabs);

        const targetTab =
          (selectedYearLabel ? tabs.find((t) => t.yearLabel === selectedYearLabel) : undefined) ??
          tabs[0];
        if (!targetTab) {
          setRow(initial);
          applyYearToDetail(initial, initial.periodYearText ?? initial.years[0]?.yearLabel ?? "");
          return;
        }

        const detail =
          targetTab.policyId === initial.id ? initial : await loadPolicyById(targetTab.policyId);
        if (cancelled) return;

        setRow(detail);
        applyYearToDetail(detail, targetTab.yearLabel);

        const urlYear = selectedYearLabel || targetTab.yearLabel;
        if (targetTab.policyId !== id || urlYear !== selectedYearLabel) {
          router.replace(
            `/policies/${targetTab.policyId}?year=${encodeURIComponent(urlYear)}`,
            { scroll: false },
          );
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Not found");
          setRow(null);
          setYearTabs([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
          setSwitchingYear(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, selectedYearLabel, missingUrl, router, applyYearToDetail]);

  const selectYear = useCallback(
    (tab: PolicyListYearSibling) => {
      router.replace(`/policies/${tab.policyId}?year=${encodeURIComponent(tab.yearLabel)}`, {
        scroll: false,
      });
    },
    [router],
  );

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
  if (loadingDetail || !row) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  const activeYearLabel =
    selectedYearLabel || row.periodYearText?.trim() || row.years[0]?.yearLabel || "";
  const y =
    row.years.find((item) => item.id === yearId) ??
    row.years.find((item) => item.yearLabel === activeYearLabel) ??
    row.years[0];
  const policyTypeLabel = row.adProductVariant
    ? adProductFormValueFromApi(row.adProductVariant) || row.policyType.name
    : row.policyType.name;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">View policy</h1>
        {canEdit ? (
          <Button asChild variant="default" size="sm" className="gap-1.5">
            <Link
              href={`/policies/${id}/edit?year=${encodeURIComponent(activeYearLabel)}`}
            >
              <Pencil className="size-3.5" />
              Edit policy
            </Link>
          </Button>
        ) : null}
      </div>

      {yearTabs.length > 0 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm font-medium">Select year</p>
          <div className="flex max-w-md flex-col gap-2">
            {yearTabs.map((tab) => {
              const active = tab.policyId === id;
              const premium = formatInrRupee(tab.vkkPremium);
              return (
                <Button
                  key={tab.policyId}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-auto w-full flex-col items-stretch gap-1 px-4 py-3 text-left",
                    active && "ring-primary/30 ring-2",
                  )}
                  onClick={() => selectYear(tab)}
                >
                  <span className="text-base font-bold tabular-nums">{yearChipLabel(tab)}</span>
                  <span
                    className={cn(
                      "text-xs font-normal",
                      active ? "text-primary-foreground/90" : "text-muted-foreground",
                    )}
                  >
                    {[tab.referenceNo, premium].filter(Boolean).join(" · ") || "Open year record"}
                  </span>
                </Button>
              );
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            Each year is a separate policy record for this SVKK ID. Choosing a year loads that
            year&apos;s policy number, reference, premium, and members below.
          </p>
          <div className="border-primary/25 bg-primary/5 ring-primary/15 mt-3 max-w-3xl rounded-lg border p-4 shadow-sm ring-1">
            <p className="text-foreground mb-3 text-sm font-semibold">This year&apos;s record</p>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Policy generated date
                </dt>
                <dd className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
                  {displayVal(row.createdAt ? formatViewDateDmy(row.createdAt) : "")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">SVKK ID</dt>
                <dd className="text-foreground mt-0.5 text-sm font-semibold">
                  {displayVal(row.insuredParty.svkkPublicId)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Reference no.
                </dt>
                <dd className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
                  {displayVal(row.referenceNo)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Month</dt>
                <dd className="text-foreground mt-0.5 text-sm font-semibold">
                  {displayVal(row.periodMonthText)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Year</dt>
                <dd className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
                  {displayVal(row.periodYearText ?? activeYearLabel)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Policy no.
                </dt>
                <dd className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
                  {displayVal(row.policyNo)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      <Card className={cn("overflow-hidden", switchingYear && "pointer-events-none opacity-60")}>
        <CardContent className="p-4 sm:p-6">
          <PolicyDetailViewBody
            row={row}
            y={y}
            activeYearLabel={activeYearLabel}
            policyTypeLabel={policyTypeLabel}
          />

        </CardContent>
      </Card>

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
    </div>
  );
}
