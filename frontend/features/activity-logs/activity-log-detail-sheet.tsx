"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  FileText,
  Shield,
  User,
} from "lucide-react";
import Link from "next/link";
import type { ActivityLogItem, PolicyDisplayRef } from "./activity-logs-view";

const ACTION_LABELS: Record<string, string> = {
  POLICY_CREATED: "Policy created",
  POLICY_UPDATED: "Policy updated",
  POLICY_SOFT_DELETED: "Policy deleted",
  POLICY_ONEDRIVE_DOC_ATTACHED: "OneDrive document attached",
  POLICY_DRIVE_DOC_ATTACHED: "Google Drive document attached",
  CSV_IMPORTED: "CSV imported",
  CSV_VALIDATED: "CSV validated",
};

export type LogDetailPayload = {
  displayBeforeData: unknown;
  displayAfterData: unknown;
  policyRef: PolicyDisplayRef | null;
  details: string[];
};

function humanAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ").toLowerCase();
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function policyPrimaryLabel(ref: PolicyDisplayRef): string | null {
  return ref.referenceNo ?? ref.policyNo ?? ref.svkkPublicId;
}

function isStaleDetailLine(line: string): boolean {
  return /^Policy ID:\s*/i.test(line) || /^Record ID/i.test(line);
}

function partitionDetails(details: string[]) {
  const clean = details.filter((l) => !isStaleDetailLine(l));
  const changes = clean.filter((l) => l.includes("→"));
  const meta = clean.filter((l) => !l.includes("→"));
  return { meta, changes };
}

function moduleBadgeClass(module: string): string {
  if (module === "policy") return "bg-blue-500/10 text-blue-700 dark:text-blue-300";
  if (module === "upload") return "bg-amber-500/10 text-amber-800 dark:text-amber-200";
  return "bg-muted text-muted-foreground";
}

function PolicyRefCard({
  ref: policyRef,
  policyId,
}: {
  ref: PolicyDisplayRef;
  policyId: string;
}) {
  const primary = policyPrimaryLabel(policyRef);
  const fields = [
    { label: "Reference", value: policyRef.referenceNo },
    { label: "Policy number", value: policyRef.policyNo },
    { label: "SVKK ID", value: policyRef.svkkPublicId },
    { label: "Holder", value: policyRef.holderName },
    { label: "Village", value: policyRef.village },
    { label: "Year", value: policyRef.yearLabel },
  ].filter((f) => f.value);

  return (
    <div className="bg-primary/5 border-primary/15 space-y-4 rounded-xl border p-4">
      <motion.div
        className="flex items-start justify-between gap-3"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <motion.div className="flex min-w-0 items-start gap-3">
          <div className="bg-primary/12 flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Shield className="text-primary size-5" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Policy
            </p>
            <p className="text-lg leading-tight font-semibold tracking-tight break-all">
              {primary ?? "Policy record"}
            </p>
          </div>
        </motion.div>
        <Button variant="outline" size="sm" className="shrink-0" asChild>
          <Link href={`/policies/${policyId}`}>
            View
            <ExternalLink className="size-3.5" />
          </Link>
        </Button>
      </motion.div>
      {fields.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {fields.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{f.label}</dt>
              <dd className="font-medium break-words">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function JsonSnapshot({ label, data }: { label: string; data: unknown }) {
  if (data == null || (typeof data === "object" && Object.keys(data as object).length === 0)) {
    return null;
  }
  return (
    <div>
      <p className="text-muted-foreground mb-1.5 text-xs font-medium">{label}</p>
      <pre className="bg-muted/80 max-h-40 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export function ActivityLogDetailSheet({
  open,
  onOpenChange,
  item,
  detail,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ActivityLogItem | null;
  detail: LogDetailPayload | null;
  loading: boolean;
}) {
  if (!item) return null;

  const policyRef = detail?.policyRef ?? item.policyRef;
  const { meta, changes } = partitionDetails(detail?.details ?? item.details);
  const hasSnapshot =
    detail != null &&
    (detail.displayBeforeData != null || detail.displayAfterData != null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="space-y-1 border-b px-6 py-5 text-left">
          <SheetTitle className="text-lg">Activity detail</SheetTitle>
          <SheetDescription>{formatWhen(item.createdAt)}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("capitalize", moduleBadgeClass(item.module))}>
              {item.module}
            </Badge>
            <Badge variant="secondary">{humanAction(item.action)}</Badge>
          </div>

          <div className="bg-muted/40 rounded-xl border p-4">
            <p className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
              <FileText className="size-3.5" />
              Summary
            </p>
            <p className="text-sm leading-relaxed font-medium">{item.summary}</p>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : item.entityType === "Policy" && policyRef ? (
            <PolicyRefCard ref={policyRef} policyId={item.entityId} />
          ) : null}

          <div className="space-y-3">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Performed by
            </p>
            <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
              <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-full">
                <User className="text-muted-foreground size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {item.user?.name ?? item.user?.email ?? "System"}
                </p>
                {item.user?.email ? (
                  <p className="text-muted-foreground truncate text-xs">{item.user.email}</p>
                ) : null}
              </div>
            </div>
          </div>

          {changes.length > 0 ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Changes
              </p>
              <ul className="space-y-2">
                {changes.map((line) => {
                  const arrowIdx = line.indexOf("→");
                  const left = arrowIdx >= 0 ? line.slice(0, arrowIdx).trim() : line;
                  const right = arrowIdx >= 0 ? line.slice(arrowIdx + 1).trim() : "";
                  const colonIdx = left.indexOf(":");
                  const label = colonIdx >= 0 ? left.slice(0, colonIdx).trim() : left;
                  const fromVal = colonIdx >= 0 ? left.slice(colonIdx + 1).trim() : "";
                  return (
                    <li
                      key={line}
                      className="bg-muted/30 flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs sm:flex-row sm:items-center sm:gap-2"
                    >
                      <span className="text-muted-foreground shrink-0 font-medium">{label}</span>
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate">{fromVal || "—"}</span>
                        <ArrowRight className="text-muted-foreground size-3 shrink-0" />
                        <span className="truncate font-medium">{right || "—"}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {meta.length > 0 ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Additional details
              </p>
              <ul className="text-muted-foreground space-y-1 text-xs">
                {meta.map((line) => (
                  <li key={line} className="leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasSnapshot ? (
            <Collapsible>
              <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium transition-colors">
                Technical snapshot
                <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3">
                <JsonSnapshot label="Before" data={detail!.displayBeforeData} />
                <JsonSnapshot label="After" data={detail!.displayAfterData} />
              </CollapsibleContent>
            </Collapsible>
          ) : loading ? (
            <Skeleton className="h-20 w-full rounded-lg" />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
