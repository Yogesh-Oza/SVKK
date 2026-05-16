"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { ExternalLink, FileText, Shield, User } from "lucide-react";
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

export type PolicyFieldChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type LogDetailPayload = {
  policyRef: PolicyDisplayRef | null;
  details: string[];
  fieldChanges: PolicyFieldChange[];
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
    <motion.div
      className="bg-primary/5 border-primary/15 space-y-4 rounded-xl border p-4"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <motion.div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <motion.div className="bg-primary/12 flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Shield className="text-primary size-5" />
          </motion.div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Policy
            </p>
            <p className="text-lg leading-tight font-semibold tracking-tight break-all">
              {primary ?? "Policy record"}
            </p>
          </div>
        </div>
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
    </motion.div>
  );
}

function ChangesTable({ rows }: { rows: PolicyFieldChange[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-xs">
        No field-level differences were recorded for this update.
      </p>
    );
  }

  return (
    <motion.div
      className="overflow-hidden rounded-lg border"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="h-9 w-[34%] text-xs">Field</TableHead>
            <TableHead className="h-9 w-[33%] text-xs">Before</TableHead>
            <TableHead className="h-9 w-[33%] text-xs">After</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.field}>
              <TableCell className="text-muted-foreground py-2 align-top text-xs font-medium">
                {row.label}
              </TableCell>
              <TableCell className="max-w-[8rem] py-2 align-top text-xs break-words whitespace-normal">
                {row.before}
              </TableCell>
              <TableCell className="max-w-[8rem] py-2 align-top text-xs font-medium break-words whitespace-normal">
                {row.after}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </motion.div>
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
  const fieldChanges = detail?.fieldChanges ?? [];
  const isPolicyUpdate = item.action === "POLICY_UPDATED";
  const isPolicyCreateOrDelete =
    item.action === "POLICY_CREATED" || item.action === "POLICY_SOFT_DELETED";
  const showChangesTable = isPolicyUpdate;
  const extraDetails = detail?.details ?? item.details;

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
            <motion.div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-16 w-full" />
            </motion.div>
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
              </motion.div>
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

          {showChangesTable ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                What changed
              </p>
              {loading ? <Skeleton className="h-32 w-full rounded-lg" /> : <ChangesTable rows={fieldChanges} />}
            </div>
          ) : null}

          {!isPolicyCreateOrDelete && !isPolicyUpdate && extraDetails.length > 0 ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Details
              </p>
              <ul className="text-muted-foreground space-y-1 text-xs">
                {extraDetails.map((line) => (
                  <li key={line} className="leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
