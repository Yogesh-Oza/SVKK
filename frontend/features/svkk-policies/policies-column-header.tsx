"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface PoliciesColumnHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
  /** Backend `sort` query value for ascending order */
  sortAsc: string;
  /** Backend `sort` query value for descending order */
  sortDesc: string;
  activeSort: string;
  onSortChange: (sortKey: string) => void;
  className?: string;
}

/** Column header matching Tasks table UX (Asc / Desc / Hide), wired to API `sort`. */
export function PoliciesColumnHeader<TData, TValue>({
  column,
  title,
  sortAsc,
  sortDesc,
  activeSort,
  onSortChange,
  className,
}: PoliciesColumnHeaderProps<TData, TValue>) {
  const sorted =
    activeSort === sortAsc ? "asc" : activeSort === sortDesc ? "desc" : false;

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 cursor-pointer data-[state=open]:bg-accent"
          >
            <span>{title}</span>
            {sorted === "desc" ? (
              <ArrowDown className="size-4" />
            ) : sorted === "asc" ? (
              <ArrowUp className="size-4" />
            ) : (
              <ChevronsUpDown className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => onSortChange(sortAsc)}
          >
            <ArrowUp className="h-3.5 w-3.5 text-muted-foreground/70" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => onSortChange(sortDesc)}
          >
            <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/70" />
            Desc
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => column.toggleVisibility(false)}
          >
            <EyeOff className="h-3.5 w-3.5 text-muted-foreground/70" />
            Hide
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
