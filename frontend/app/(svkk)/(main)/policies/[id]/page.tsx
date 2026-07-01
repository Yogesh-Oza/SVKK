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
import { resolvePolicyTypeDisplayLabel } from "@/features/svkk-policies/ad-product-variant";
import { PolicyProfileView } from "@/features/svkk-policies/policy-profile-view";
import type { PolicyDetailViewRow } from "@/features/svkk-policies/policy-detail-view-body";
import {
  fetchPolicyYearSiblings,
  singleRowYearSibling,
  type PolicyListYearSibling,
} from "@/features/svkk-policies/policy-year-siblings";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { fetchPolicyDetail } from "@/lib/svkk/offline/policy-data";
import { replacePolicyRoute } from "@/lib/svkk/offline/navigate";
import { useDropdownOptions } from "@/lib/svkk/use-dropdown-options";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import {
  canDeletePolicy,
  canUpdatePolicy,
} from "@/lib/svkk/permissions";
import type { PolicyDetailForReceipt } from "@/lib/svkk/policy-receipt-print";
import { buildReceiptDocumentHtml } from "@/lib/svkk/policy-receipt-print";
import { resolveReceiptImagesForPrint } from "@/lib/svkk/receipt-image-resolve";
import {
  buildReceiptFilename,
  downloadReceiptPreviewAsPdf,
  printReceiptPreview,
} from "@/lib/svkk/receipt-pdf";
import { useReceiptSettings } from "@/lib/svkk/use-receipt-settings";
import { useOfflineStatus } from "@/lib/svkk/offline/use-offline-status";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type PolicyDetail = PolicyDetailViewRow & {
  id: string;
  updatedAt: string;
  createdAt?: string | null;
};

function prioritizeYear(
  p: PolicyDetailForReceipt,
  selectedYearLabel?: string,
): PolicyDetailForReceipt {
  if (!selectedYearLabel) return p;
  const idx = p.years.findIndex((y) => y.yearLabel === selectedYearLabel);
  if (idx <= 0) return p;
  const picked = p.years[idx];
  if (!picked) return p;
  return {
    ...p,
    years: [picked, ...p.years.filter((_, i) => i !== idx)],
  };
}

async function loadPolicyById(policyId: string): Promise<PolicyDetail> {
  const cached = await fetchPolicyDetail(policyId);
  return cached as unknown as PolicyDetail;
}

export default function SvkkPolicyDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useSvkkAuth();
  const { options: ddOptions } = useDropdownOptions();
  const receiptImageUrls = useReceiptSettings();
  const printIframeRef = useRef<HTMLIFrameElement | null>(null);

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
  const [receiptBusy, setReceiptBusy] = useState(false);
  const missingUrl = !getSvkkApiBase();

  const { online } = useOfflineStatus();
  const perms = user?.permissions ?? [];
  const canDel = canDeletePolicy(perms) && online;
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
          replacePolicyRoute(
            `/policies/${targetTab.policyId}?year=${encodeURIComponent(urlYear)}`,
            router,
          );
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Not found";
          setErr(
            /network/i.test(msg)
              ? "Could not reach the server. If this policy was downloaded for offline use, try again — otherwise go online and sync."
              : msg,
          );
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
      replacePolicyRoute(
        `/policies/${tab.policyId}?year=${encodeURIComponent(tab.yearLabel)}`,
        router,
      );
    },
    [router],
  );

  const buildReceiptHtml = useCallback(
    async (yearLabel: string) => {
      if (!row) return null;
      const payload = prioritizeYear(row as unknown as PolicyDetailForReceipt, yearLabel);
      const resolved = await resolveReceiptImagesForPrint(receiptImageUrls);
      return buildReceiptDocumentHtml(payload, { embedded: true, ...resolved });
    },
    [row, receiptImageUrls],
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

  async function mountPrintIframe(html: string): Promise<boolean> {
    printIframeRef.current?.remove();
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Receipt Preview Frame");
    iframe.style.cssText =
      "position:fixed;left:-99999px;top:0;width:794px;height:1200px;border:0;visibility:hidden;";
    document.body.appendChild(iframe);
    printIframeRef.current = iframe;

    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error("Receipt iframe failed to load"));
      iframe.srcdoc = html;
    });

    return printReceiptPreview();
  }

  async function handleDownloadReceipt() {
    if (!row) return;
    setReceiptBusy(true);
    const tId = toast.loading("Preparing PDF…");
    try {
      const yearLabel =
        selectedYearLabel || row.periodYearText?.trim() || row.years[0]?.yearLabel || "";
      const html = await buildReceiptHtml(yearLabel);
      if (!html) {
        toast.error("Could not generate receipt", { id: tId });
        return;
      }
      const filename = buildReceiptFilename([
        "receipt",
        row.insuredParty?.svkkPublicId || row.policyNo,
        yearLabel || row.periodYearText,
      ]);
      const ok = await downloadReceiptPreviewAsPdf(filename, html);
      if (ok) {
        toast.success("PDF downloaded", { id: tId });
      } else {
        toast.error("Could not generate PDF", { id: tId });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF failed", { id: tId });
    } finally {
      setReceiptBusy(false);
    }
  }

  async function handlePrintReceipt() {
    if (!row) return;
    setReceiptBusy(true);
    const tId = toast.loading("Preparing print…");
    try {
      const yearLabel =
        selectedYearLabel || row.periodYearText?.trim() || row.years[0]?.yearLabel || "";
      const html = await buildReceiptHtml(yearLabel);
      if (!html) {
        toast.error("Could not generate receipt", { id: tId });
        return;
      }
      const ok = await mountPrintIframe(html);
      if (ok) {
        toast.dismiss(tId);
      } else {
        toast.error("Receipt not ready to print", { id: tId });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Print failed", { id: tId });
    } finally {
      setReceiptBusy(false);
    }
  }

  useEffect(() => {
    return () => {
      printIframeRef.current?.remove();
    };
  }, []);

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
  const policyTypeLabel = resolvePolicyTypeDisplayLabel(
    row.policyType,
    row.adProductVariant,
    ddOptions.policyTypes,
  );

  const svkkId = row.insuredParty.svkkPublicId.trim();
  const renewHref = svkkId
    ? `/policies/new?svkk=${encodeURIComponent(svkkId)}&year=${encodeURIComponent(activeYearLabel)}&renew=1`
    : "/policies/new";

  return (
    <div className="pb-10">
      <PolicyProfileView
        row={row}
        y={y}
        activeYearLabel={activeYearLabel}
        policyTypeLabel={policyTypeLabel}
        createdAt={row.createdAt}
        yearTabs={yearTabs}
        currentPolicyId={id}
        onSelectYear={selectYear}
        canEdit={canEdit}
        editHref={`/policies/${id}/edit?year=${encodeURIComponent(activeYearLabel)}`}
        renewHref={renewHref}
        onDownload={() => void handleDownloadReceipt()}
        onPrint={() => void handlePrintReceipt()}
        receiptBusy={receiptBusy}
        switchingYear={switchingYear}
      />

      {canDel ? (
        <>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="mt-6"
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
