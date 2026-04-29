"use client";

import { DataTableFacetedFilter } from "@/components/data-table/data-table-filtered";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { format } from "date-fns";
import {
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { toast } from "sonner";
import { formatInr } from "./currency";
import { DUMMY_PREMIUM_RECEIPTS } from "./dummy-data";
import type { PremiumMethod, PremiumReceipt, PremiumStatus } from "./types";

const STATUS_OPTIONS: { label: string; value: PremiumStatus }[] = [
  { label: "Completed", value: "completed" },
  { label: "Processing", value: "processing" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
  { label: "Disputed", value: "disputed" },
];

const METHOD_OPTIONS: { label: string; value: PremiumMethod }[] = [
  { label: "UPI", value: "UPI" },
  { label: "NEFT", value: "NEFT" },
  { label: "Cash", value: "Cash" },
  { label: "Cheque", value: "Cheque" },
  { label: "Card", value: "Card" },
  { label: "Bank transfer", value: "Bank transfer" },
];

function listIncludesValue<T>(row: Row<PremiumReceipt>, id: string, value: T[] | undefined) {
  if (!value || value.length === 0) return true;
  return value.includes(row.getValue(id) as T);
}

function statusBadge(s: PremiumStatus) {
  const base = "text-xs font-normal capitalize";
  switch (s) {
    case "completed":
      return <Badge className={base + " border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"}>{s}</Badge>;
    case "processing":
      return <Badge className={base + " border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"}>{s}</Badge>;
    case "pending":
      return <Badge className={base + " border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"}>{s}</Badge>;
    case "failed":
      return <Badge variant="destructive" className={base}>{s}</Badge>;
    case "refunded":
      return <Badge className={base + " border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"}>{s}</Badge>;
    case "disputed":
      return <Badge className={base + " border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"}>{s}</Badge>;
    default:
      return <Badge variant="secondary">{s}</Badge>;
  }
}

export function PremiumReceiptsTable() {
  const data = DUMMY_PREMIUM_RECEIPTS;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<PremiumReceipt>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
            className="translate-y-0.5"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
            className="translate-y-0.5"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "reference",
        header: "Reference",
        cell: ({ row }) => <span className="font-mono text-sm">{row.getValue("reference")}</span>,
      },
      {
        id: "customer",
        accessorFn: (r) => r.customerName,
        header: "Customer",
        cell: ({ row }) => {
          const r0 = row.original;
          const initials = r0.customerName
            .split(" ")
            .map((p) => p[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
          return (
            <div className="flex min-w-0 max-w-[220px] items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r0.customerName}</p>
                <p className="text-muted-foreground truncate text-xs">{r0.email}</p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "amount",
        header: () => <span className="whitespace-nowrap">Amount (gross)</span>,
        cell: ({ row }) => <span className="font-medium tabular-nums">{formatInr(row.getValue("amount"))}</span>,
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => statusBadge(row.getValue("status") as PremiumStatus),
        filterFn: (row, id, value) => listIncludesValue(row, id, value as PremiumStatus[] | undefined),
      },
      {
        accessorKey: "method",
        header: "Method",
        cell: ({ row }) => <span className="whitespace-nowrap text-sm">{row.getValue("method")}</span>,
        filterFn: (row, id, value) => listIncludesValue(row, id, value as PremiumMethod[] | undefined),
      },
      {
        accessorKey: "gateway",
        header: "Gateway / product",
        cell: ({ row }) => (
          <span
            className="text-muted-foreground max-w-[160px] truncate text-sm"
            title={String(row.getValue("gateway"))}
          >
            {row.getValue("gateway")}
          </span>
        ),
      },
      {
        accessorKey: "net",
        header: "Net to pool",
        cell: ({ row }) => {
          const n = row.getValue("net") as number;
          return <span className={`tabular-nums text-sm ${n < 0 ? "text-destructive" : ""}`}>{formatInr(n)}</span>;
        },
      },
      {
        accessorKey: "at",
        header: "Date",
        cell: ({ row }) => {
          const d = new Date(row.getValue("at") as string);
          return (
            <div className="whitespace-nowrap text-sm">
              <p>{format(d, "MMM d, yyyy")}</p>
              <p className="text-muted-foreground text-xs tabular-nums">{format(d, "HH:mm:ss")}</p>
            </div>
          );
        },
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const ref = row.original.reference;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => {
                    void navigator.clipboard.writeText(ref);
                    toast.message("Reference copied", { description: ref });
                  }}
                >
                  Copy reference
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" disabled onClick={() => {}}>
                  Open policy
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" disabled onClick={() => {}}>
                  View receipt
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    getRowId: (r) => r.id,
    state: { sorting, columnFilters, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, value) => {
      const s = String(value ?? "").toLowerCase().trim();
      if (!s) return true;
      const o = row.original;
      return (
        o.reference.toLowerCase().includes(s) ||
        o.customerName.toLowerCase().includes(s) ||
        o.email.toLowerCase().includes(s)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const colCount = table.getVisibleLeafColumns().length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search transactions..."
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-9 w-[200px] pl-8 lg:w-[280px]"
            />
          </div>
          {table.getColumn("status") && (
            <DataTableFacetedFilter
              column={table.getColumn("status")}
              title="Status"
              options={STATUS_OPTIONS}
            />
          )}
          {table.getColumn("method") && (
            <DataTableFacetedFilter
              column={table.getColumn("method")}
              title="Method"
              options={METHOD_OPTIONS}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <DataTableViewOptions table={table} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 cursor-pointer"
            onClick={() =>
              toast.message("Sample data", { description: "Connect exports to your MIS when ready." })
            }
          >
            Export
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={colCount} className="text-muted-foreground h-24 text-center text-sm">
                  No transactions match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-muted-foreground flex flex-col gap-3 px-0 sm:flex-row sm:items-center sm:justify-between sm:px-1">
        <p className="text-sm">
          {Object.keys(rowSelection).length} of {table.getFilteredRowModel().rows.length} transaction(s) selected.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-6">
          <div className="flex items-center gap-2">
            <Label htmlFor="receipts-page-size" className="whitespace-nowrap text-sm">
              Rows
            </Label>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger id="receipts-page-size" className="h-8 w-[72px] cursor-pointer" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="whitespace-nowrap text-sm">
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              className="size-8 p-0"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">First page</span>
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="size-8 p-0"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Previous</span>
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="size-8 p-0"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Next</span>
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="size-8 p-0"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Last page</span>
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
