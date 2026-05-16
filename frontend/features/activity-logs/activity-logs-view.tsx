"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  ActivityLogDetailSheet,
  type LogDetailPayload,
} from "@/features/activity-logs/activity-log-detail-sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Filter,
  History,
  Loader2,
  RotateCcw,
  Search,
  User,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PolicyDisplayRef = {
  referenceNo: string | null;
  policyNo: string | null;
  svkkPublicId: string | null;
  holderName: string | null;
  village: string | null;
  yearLabel: string | null;
};

export type ActivityLogItem = {
  id: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  entityKey?: string | null;
  policyRef?: PolicyDisplayRef | null;
  summary: string;
  details: string[];
  createdAt: string;
  user: { id: string; name: string | null; email: string } | null;
};

type LogActorOption = {
  id: string;
  name: string;
  email: string;
  roleSlug: string;
  roleName: string;
};

type LogRoleOption = {
  slug: string;
  name: string;
};

type LogsMeta = {
  modules: string[];
  actions: string[];
  entityTypes: string[];
  actors: LogActorOption[];
  roles: LogRoleOption[];
};

type LogsFilters = {
  search: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  roleSlug: string;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: LogsFilters = {
  search: "",
  module: "",
  action: "",
  entityType: "",
  entityId: "",
  userId: "",
  roleSlug: "",
  dateFrom: "",
  dateTo: "",
};

const MODULE_COLORS: Record<string, string> = {
  policy: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  upload: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
};

function moduleBadgeClass(module: string): string {
  return MODULE_COLORS[module] ?? "bg-muted text-muted-foreground";
}

function buildQuery(filters: LogsFilters, cursor?: string): string {
  const p = new URLSearchParams();
  p.set("limit", "30");
  if (cursor) p.set("cursor", cursor);
  if (filters.search.trim()) p.set("search", filters.search.trim());
  if (filters.module) p.set("module", filters.module);
  if (filters.action) p.set("action", filters.action);
  if (filters.entityType) p.set("entityType", filters.entityType);
  if (filters.entityId.trim()) p.set("entityId", filters.entityId.trim());
  if (filters.userId) p.set("userId", filters.userId);
  if (filters.roleSlug) p.set("roleSlug", filters.roleSlug);
  if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) p.set("dateTo", filters.dateTo);
  return `/logs?${p.toString()}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function entityHref(item: ActivityLogItem): string | null {
  if (item.entityType === "Policy") {
    return `/policies/${item.entityId}`;
  }
  return null;
}

export function ActivityLogsView() {
  const missingUrl = !getSvkkApiBase();
  const [meta, setMeta] = useState<LogsMeta | null>(null);
  const [filters, setFilters] = useState<LogsFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<LogsFilters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<ActivityLogItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<ActivityLogItem | null>(null);
  const [detailPayload, setDetailPayload] = useState<LogDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (applied.search.trim()) n++;
    if (applied.module) n++;
    if (applied.action) n++;
    if (applied.entityType) n++;
    if (applied.entityId.trim()) n++;
    if (applied.userId) n++;
    if (applied.roleSlug) n++;
    if (applied.dateFrom) n++;
    if (applied.dateTo) n++;
    return n;
  }, [applied]);

  const fetchPage = useCallback(
    async (f: LogsFilters, cursor?: string, append = false) => {
      const res = await svkkJson<{ items: ActivityLogItem[]; nextCursor?: string }>(
        buildQuery(f, cursor),
      );
      setRows((prev) => (append ? [...prev, ...res.items] : res.items));
      setNextCursor(res.nextCursor);
    },
    [],
  );

  const load = useCallback(
    async (f: LogsFilters) => {
      setLoading(true);
      setErr(null);
      try {
        await fetchPage(f);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load logs");
        setRows([]);
        setNextCursor(undefined);
      } finally {
        setLoading(false);
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    if (missingUrl) return;
    void (async () => {
      try {
        const m = await svkkJson<LogsMeta>("/logs/meta");
        setMeta(m);
      } catch {
        setMeta({
          modules: ["policy", "upload"],
          actions: [],
          entityTypes: ["Policy"],
          actors: [],
          roles: [],
        });
      }
    })();
  }, [missingUrl]);

  useEffect(() => {
    if (missingUrl) return;
    void load(applied);
  }, [missingUrl, applied, load]);

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setApplied((prev) => ({ ...prev, search: filters.search }));
    }, 400);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [filters.search]);

  const applyFilters = () => {
    setApplied({
      ...filters,
      search: filters.search.trim(),
    });
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(applied, nextCursor, true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  const openDetail = async (item: ActivityLogItem) => {
    setSelected(item);
    setDetailPayload(null);
    setDetailLoading(true);
    try {
      const full = await svkkJson<
        ActivityLogItem & {
          displayBeforeData: unknown;
          displayAfterData: unknown;
        }
      >(`/logs/${item.id}`);
      setDetailPayload({
        displayBeforeData: full.displayBeforeData,
        displayAfterData: full.displayAfterData,
        policyRef: full.policyRef ?? null,
        details: full.details,
      });
      setSelected((prev) =>
        prev?.id === item.id
          ? {
              ...prev,
              entityLabel: full.entityLabel ?? prev.entityLabel,
              entityKey: full.entityKey ?? prev.entityKey,
              details: full.details,
              policyRef: full.policyRef ?? prev.policyRef,
            }
          : prev,
      );
    } catch {
      setDetailPayload(null);
    } finally {
      setDetailLoading(false);
    }
  };

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <motion.div
      className="min-w-0 w-full max-w-full space-y-8 pb-10"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <motion.div className="space-y-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h1 className="text-3xl font-bold tracking-tight">Activity logs</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Audit trail of policy changes, uploads, and imports. Use filters to narrow by module,
            action, date, or search by holder name and reference.
          </p>
        </motion.div>
        <Badge variant="outline" className="w-fit gap-1.5 py-1.5">
          <History className="size-3.5" />
          {loading ? "Loading…" : `${rows.length} shown`}
        </Badge>
      </motion.div>

      <Card className="min-w-0 w-full overflow-hidden py-0 shadow-md">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CardHeader className="bg-muted/20 flex flex-row flex-wrap items-start justify-between gap-4 border-b py-5 sm:items-center">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="size-4" />
                Filters
                {activeFilterCount > 0 ? (
                  <Badge variant="secondary" className="font-normal">
                    {activeFilterCount} active
                  </Badge>
                ) : null}
              </CardTitle>
              <CardDescription>Search and narrow the audit trail</CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                {filtersOpen ? "Hide" : "Show"}
                <ChevronDown
                  className={cn("size-4 transition-transform", filtersOpen && "rotate-180")}
                />
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="grid gap-4 border-b py-5 sm:grid-cols-2 lg:grid-cols-3">
              <motion.div
                className="space-y-2 sm:col-span-2 lg:col-span-3"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
              >
                <Label htmlFor="log-search">Search</Label>
                <div className="relative">
                  <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    id="log-search"
                    placeholder="Holder name, email, policy ref, action, entity ID…"
                    className="pl-9"
                    value={filters.search}
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyFilters();
                    }}
                  />
                </div>
              </motion.div>
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Label>Module</Label>
                <Select
                  value={filters.module || "__all__"}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, module: v === "__all__" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All modules" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All modules</SelectItem>
                    {(meta?.modules ?? []).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
              >
                <Label>Action</Label>
                <Select
                  value={filters.action || "__all__"}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, action: v === "__all__" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All actions</SelectItem>
                    {(meta?.actions ?? []).map((a) => (
                      <SelectItem key={a} value={a}>
                        {a.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 }}
              >
                <Label>Entity type</Label>
                <Select
                  value={filters.entityType || "__all__"}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, entityType: v === "__all__" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All types</SelectItem>
                    {(meta?.entityTypes ?? []).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 }}
              >
                <Label>User</Label>
                <Select
                  value={filters.userId || "__all__"}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, userId: v === "__all__" ? "" : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All users</SelectItem>
                    {(meta?.actors ?? [])
                      .filter((a) => !filters.roleSlug || a.roleSlug === filters.roleSlug)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} ({a.roleName})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </motion.div>
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.17 }}
              >
                <Label>User role</Label>
                <Select
                  value={filters.roleSlug || "__all__"}
                  onValueChange={(v) => {
                    const roleSlug = v === "__all__" ? "" : v;
                    setFilters((f) => {
                      const next = { ...f, roleSlug };
                      if (roleSlug && f.userId) {
                        const actor = meta?.actors.find((a) => a.id === f.userId);
                        if (actor && actor.roleSlug !== roleSlug) {
                          next.userId = "";
                        }
                      }
                      return next;
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All roles</SelectItem>
                    {(meta?.roles ?? []).map((r) => (
                      <SelectItem key={r.slug} value={r.slug}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 }}
              >
                <Label htmlFor="log-entity-id">Entity ID</Label>
                <Input
                  id="log-entity-id"
                  placeholder="Policy cuid…"
                  value={filters.entityId}
                  onChange={(e) => setFilters((f) => ({ ...f, entityId: e.target.value }))}
                />
              </motion.div>
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.19 }}
              >
                <Label htmlFor="log-from">From date</Label>
                <Input
                  id="log-from"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                />
              </motion.div>
              <motion.div
                className="space-y-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.21 }}
              >
                <Label htmlFor="log-to">To date</Label>
                <Input
                  id="log-to"
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                />
              </motion.div>
            </CardContent>
            <CardFooter className="bg-muted/10 flex flex-wrap gap-2 border-b py-4">
              <Button type="button" onClick={applyFilters}>
                Apply filters
              </Button>
              <Button type="button" variant="outline" onClick={resetFilters}>
                <RotateCcw className="size-4" />
                Reset
              </Button>
            </CardFooter>
          </CollapsibleContent>
        </Collapsible>

        {err ? (
          <p className="text-destructive px-6 py-4 text-sm">{err}</p>
        ) : null}

        <div className="min-w-0 w-full [&_[data-slot=table-container]]:overflow-x-visible">
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-2" />
                <TableHead className="w-[11%] px-2">When</TableHead>
                <TableHead className="w-[12%] px-2">User</TableHead>
                <TableHead className="px-2">Activity</TableHead>
                <TableHead className="w-[9%] px-2">Module</TableHead>
                <TableHead className="w-[14%] px-2">Entity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : rows.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground py-12 text-center">
                        <ClipboardList className="mx-auto mb-2 size-8 opacity-40" />
                        No activity logs match your filters.
                      </TableCell>
                    </TableRow>
                  )
                  : rows.map((r) => {
                      const isOpen = expanded[r.id];
                      const href = entityHref(r);
                      return (
                        <Fragment key={r.id}>
                          <TableRow
                            className="hover:bg-muted/40 cursor-pointer"
                            onClick={() => void openDetail(r)}
                          >
                            <TableCell
                              className="w-8 p-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpanded((ex) => ({ ...ex, [r.id]: !ex[r.id] }));
                              }}
                            >
                              {r.details.length > 0 ? (
                                isOpen ? (
                                  <ChevronDown className="size-4" />
                                ) : (
                                  <ChevronRight className="size-4" />
                                )
                              ) : null}
                            </TableCell>
                            <TableCell className="text-muted-foreground px-2 text-xs whitespace-normal">
                              {formatWhen(r.createdAt)}
                            </TableCell>
                            <TableCell className="px-2 text-xs whitespace-normal">
                              {r.user ? (
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <User className="text-muted-foreground size-3.5 shrink-0" />
                                  <span className="min-w-0 truncate" title={r.user.email}>
                                    {r.user.name || r.user.email}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">System</span>
                              )}
                            </TableCell>
                            <TableCell className="px-2 whitespace-normal">
                              <p className="text-sm leading-snug font-medium break-words">{r.summary}</p>
                            </TableCell>
                            <TableCell className="px-2 whitespace-normal">
                              <Badge
                                variant="outline"
                                className={cn("max-w-full truncate capitalize", moduleBadgeClass(r.module))}
                              >
                                {r.module}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className="px-2 text-xs whitespace-normal"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {href ? (
                                <Link
                                  href={href}
                                  className="text-primary block truncate font-medium hover:underline"
                                  title={r.entityLabel}
                                >
                                  {r.entityLabel}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground block truncate" title={r.entityLabel}>
                                  {r.entityLabel}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                          {isOpen && r.details.length > 0 ? (
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableCell />
                              <TableCell colSpan={5} className="py-3">
                                <ul className="text-muted-foreground list-inside list-disc space-y-1 text-xs">
                                  {r.details.map((line) => (
                                    <li key={line}>{line}</li>
                                  ))}
                                </ul>
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
            </TableBody>
          </Table>
        </div>

        {nextCursor ? (
          <CardFooter className="justify-center border-t py-4">
            <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </>
              ) : (
                "Load more"
              )}
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <ActivityLogDetailSheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setDetailPayload(null);
          }
        }}
        item={selected}
        detail={detailPayload}
        loading={detailLoading}
      />
    </motion.div>
  );
}
