"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateLeadDialog } from "./create-lead-dialog";
import { LeadTableToolbar } from "./lead-table-toolbar";
import type { LeadStage } from "../types/lead.types";

export interface LeadRow {
  id: string;
  name: string;
  phone: string;
  source: string;
  stage: LeadStage;
  assignedUserId: string | null;
  assignedUserName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LeadTableProps {
  leads: LeadRow[];
  total: number;
  page: number;
  limit: number;
  search: string;
  stage: string;
  onSearchChange: (value: string) => void;
  onStageChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  isAdmin?: boolean;
}

const STAGE_COLORS: Record<LeadStage, string> = {
  new: "bg-slate-500",
  contacted: "bg-blue-500",
  interested: "bg-amber-500",
  done: "bg-green-500",
  lost: "bg-red-500",
};

export function LeadTable({
  leads,
  total,
  page,
  limit,
  search,
  stage,
  onSearchChange,
  onStageChange,
  onPageChange,
  onRefresh,
  isAdmin = false,
}: LeadTableProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  const columns: ColumnDef<LeadRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
    },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => (
        <span className="capitalize">{row.original.source ?? "-"}</span>
      ),
    },
    {
      accessorKey: "stage",
      header: "Stage",
      cell: ({ row }) => {
        const s = row.original.stage;
        return (
          <Badge
            variant="secondary"
            className={`${STAGE_COLORS[s] ?? "bg-muted"} text-white border-0 capitalize`}
          >
            {s}
          </Badge>
        );
      },
    },
    {
      accessorKey: "assignedUserName",
      header: "Assigned To",
      cell: ({ row }) => row.original.assignedUserName ?? "-",
    },
    {
      accessorKey: "createdAt",
      header: "Created At",
      cell: ({ row }) =>
        format(new Date(row.original.createdAt), "MMM d, yyyy"),
    },
  ];

  const table = useReactTable({
    data: leads,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-4">
      <LeadTableToolbar
        search={search}
        onSearchChange={onSearchChange}
        stage={stage}
        onStageChange={onStageChange}
        onAddLead={() => setDialogOpen(true)}
      />
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/leads/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No leads found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-4">
        <div className="text-muted-foreground text-sm">
          {total} lead{total !== 1 ? "s" : ""} total
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            Previous
          </Button>
          <span className="text-sm">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="cursor-pointer disabled:cursor-not-allowed"
          >
            Next
          </Button>
        </div>
      </div>
      <CreateLeadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={onRefresh}
        isAdmin={isAdmin}
      />
    </div>
  );
}
