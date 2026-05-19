"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { backendApi } from "@/lib/api/svkk-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { svkkJson } from "@/lib/svkk/api";
import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  formatCell,
  type PolicyMemberRow,
  ROW_KEYS,
} from "./policy-member-report-section";

type DrillSection = {
  categoryKey: string;
  categoryLabel: string;
  rows: PolicyMemberRow[];
};

type DrillResponse = {
  drillType: "village" | "area";
  drillLabel: string;
  sections: DrillSection[];
};

const DRILL_HEADERS: { key: keyof PolicyMemberRow; title: string }[] = [
  { key: "label", title: "Type of PO" },
  { key: "totalPolicies", title: "Total policies" },
  { key: "membersPlusPolicies", title: "Members + policies" },
  { key: "cntAshaKiran", title: "Asha-kiran" },
  { key: "cntFamilyFloater", title: "Family-floating" },
  { key: "cntIndividual", title: "Individual" },
  { key: "sumVkk", title: "Total VKK premium" },
  { key: "sumCo", title: "Co premium" },
  { key: "sumGross", title: "Gross premium" },
  { key: "sumComm", title: "Commission" },
  { key: "sumTwoLac", title: "Two lakh F" },
  { key: "sumPolHolder", title: "Policy holder premium" },
  { key: "sumGaam", title: "Gaam Mahajan VKK refund" },
  { key: "sumRefund", title: "Refund cheque amt" },
  { key: "sumCd", title: "CD amount" },
  { key: "age0_18", title: "Age 0–18" },
  { key: "age19_35", title: "Age 19–35" },
  { key: "age36_45", title: "Age 36–45" },
  { key: "age46_50", title: "Age 46–50" },
  { key: "age51_55", title: "Age 51–55" },
  { key: "age56_60", title: "Age 56–60" },
  { key: "age61_65", title: "Age 61–65" },
  { key: "age65p", title: "Age >65" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drillType: "village" | "area" | null;
  drillLabel: string | null;
  reportQueryString: string;
};

export function PolicyMemberDrillDownSheet({
  open,
  onOpenChange,
  drillType,
  drillLabel,
  reportQueryString,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [detail, setDetail] = useState<DrillResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !drillType || !drillLabel) {
      setDetail(null);
      setError(null);
      return;
    }

    const q = new URLSearchParams(reportQueryString);
    if (drillType === "village") {
      q.set("drillVillage", drillLabel);
    } else {
      q.set("drillArea", drillLabel);
    }

    setLoading(true);
    setError(null);
    setExportError(null);
    void (async () => {
      try {
        const res = await svkkJson<DrillResponse>(
          `/mis/policy-member-report/detail?${q.toString()}`,
        );
        setDetail(res);
      } catch (e) {
        setDetail(null);
        setError(e instanceof Error ? e.message : "Failed to load detail");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, drillType, drillLabel, reportQueryString]);

  const exportDrillDownCsv = useCallback(() => {
    if (!drillType || !drillLabel) return;
    void (async () => {
      setExportBusy(true);
      setExportError(null);
      try {
        const q = new URLSearchParams(reportQueryString);
        if (drillType === "village") {
          q.set("drillVillage", drillLabel);
        } else {
          q.set("drillArea", drillLabel);
        }
        const res = await backendApi.get(
          `/mis/export/policy-member-report-detail.csv?${q.toString()}`,
          { responseType: "blob" },
        );
        const slug = drillLabel
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const blob = new Blob([res.data], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `policy-member-${drillType}-${slug || "detail"}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        setExportError(e instanceof Error ? e.message : "Export failed");
      } finally {
        setExportBusy(false);
      }
    })();
  }, [drillLabel, drillType, reportQueryString]);

  const title =
    drillType && drillLabel
      ? `${drillType === "village" ? "Village" : "Area"}: ${drillLabel}`
      : "Detail";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92vh,960px)] w-[min(98vw,1800px)] max-w-[min(98vw,1800px)]! flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(98vw,1800px)]!">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0 space-y-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                Breakdown by category and policy grouping (SVKK, NVKK, RTY, OTHER). Uses the same
                filters as the main report.
              </DialogDescription>
              {exportError ? (
                <p className="text-destructive text-sm">{exportError}</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={loading || exportBusy || !drillType || !drillLabel}
              onClick={() => exportDrillDownCsv()}
            >
              <Download className="size-3.5" />
              {exportBusy ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : detail?.sections.length ? (
            <div className="space-y-8">
              {detail.sections.map((section) => (
                <section key={section.categoryKey}>
                  <h3 className="mb-2 text-sm font-semibold capitalize">
                    {detail.drillType} {detail.drillLabel.toLowerCase()} — {section.categoryLabel}
                  </h3>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {DRILL_HEADERS.map((h) => (
                            <TableHead
                              key={h.key}
                              className="whitespace-nowrap bg-muted/40 text-xs font-semibold"
                            >
                              {h.title}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {section.rows.map((row) => (
                          <TableRow key={row.label} className="text-sm">
                            {DRILL_HEADERS.map((h) => (
                              <TableCell key={h.key} className="py-1.5 min-w-[5.5rem]">
                                {h.key === "label" ? (
                                  <span className="font-medium uppercase">{row.label}</span>
                                ) : (
                                  <span className="tabular-nums text-right block">
                                    {formatCell(h.key, row[h.key] as number)}
                                  </span>
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No detail data.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
