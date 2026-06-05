"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  allExportUiKeys,
  type PolicyCsvExportColumnGroup,
} from "@/features/svkk-policies/policy-csv-export-columns";

export type { PolicyCsvExportColumn, PolicyCsvExportColumnGroup } from "@/features/svkk-policies/policy-csv-export-columns";
import { svkkJson } from "@/lib/svkk/api";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ExportColumnsResponse = {
  groups: PolicyCsvExportColumnGroup[];
};

function groupUiKeys(group: PolicyCsvExportColumnGroup): string[] {
  return group.columns.map((c) => c.key);
}

export function PolicyCsvExportDialog({
  open,
  onOpenChange,
  onExport,
  exporting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (columns: string[]) => Promise<void>;
  exporting: boolean;
}) {
  const [groups, setGroups] = useState<PolicyCsvExportColumnGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const uiKeys = useMemo(() => allExportUiKeys(groups), [groups]);
  const selectedUiCount = useMemo(
    () => uiKeys.filter((key) => selected.has(key)).length,
    [uiKeys, selected],
  );

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await svkkJson<ExportColumnsResponse>("/policies/export-columns");
      const nextGroups = data.groups ?? [];
      setGroups(nextGroups);
      setSelected(new Set(allExportUiKeys(nextGroups)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load export columns");
      setGroups([]);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadGroups();
  }, [open, loadGroups]);

  const toggleGroup = (group: PolicyCsvExportColumnGroup, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of groupUiKeys(group)) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const toggleColumn = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const setAll = (checked: boolean) => {
    setSelected(checked ? new Set(uiKeys) : new Set());
  };

  const groupState = (group: PolicyCsvExportColumnGroup): boolean | "indeterminate" => {
    const keys = groupUiKeys(group);
    const picked = keys.filter((k) => selected.has(k)).length;
    if (picked === 0) return false;
    if (picked === keys.length) return true;
    return "indeterminate";
  };

  const handleExport = async () => {
    if (!selected.size) {
      toast.error("Select at least one column to export");
      return;
    }
    const keys = [...selected];
    const exportAll = selectedUiCount === uiKeys.length;
    await onExport(exportAll ? [] : keys);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90vh,52rem)] max-h-[min(90vh,52rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
          <DialogTitle>Export policies CSV</DialogTitle>
          <DialogDescription>
            Choose which fields to include. Current table filters still apply to exported rows.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-6 py-3">
          <p className="text-muted-foreground text-sm">
            {loading ? "Loading columns…" : `${selectedUiCount} of ${uiKeys.length} fields selected`}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || exporting}
              onClick={() => setAll(true)}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || exporting}
              onClick={() => setAll(false)}
            >
              Clear all
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading export columns…</p>
          ) : (
            <div className="space-y-5 pb-1 pr-2">
              {groups.map((group) => {
                const state = groupState(group);
                return (
                  <section key={group.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`export-group-${group.id}`}
                        checked={state === "indeterminate" ? "indeterminate" : state}
                        disabled={exporting}
                        onCheckedChange={(v) => toggleGroup(group, v === true)}
                      />
                      <label
                        htmlFor={`export-group-${group.id}`}
                        className="text-sm font-semibold leading-none"
                      >
                        {group.label}
                        <span className="text-muted-foreground ml-2 font-normal">
                          ({group.columns.length})
                        </span>
                      </label>
                    </div>
                    <div
                      className={cn(
                        "grid gap-2 pl-6",
                        group.columns.length > 1 ? "sm:grid-cols-2" : "max-w-xl",
                      )}
                    >
                      {group.columns.map((col) => (
                        <label
                          key={col.key}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm",
                            selected.has(col.key) && "border-primary/40 bg-primary/5",
                          )}
                        >
                          <Checkbox
                            checked={selected.has(col.key)}
                            disabled={exporting}
                            onCheckedChange={(v) => toggleColumn(col.key, v === true)}
                          />
                          <span className="font-medium">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <Separator className="shrink-0" />
        <DialogFooter className="shrink-0 px-6 py-4">
          <Button type="button" variant="outline" disabled={exporting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-1.5"
            disabled={loading || exporting || selectedUiCount === 0}
            onClick={() => void handleExport()}
          >
            <Download className="size-3.5" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
