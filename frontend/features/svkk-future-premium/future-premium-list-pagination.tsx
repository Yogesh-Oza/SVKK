"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const FUTURE_PREMIUM_PAGE_SIZES = [10, 25, 50, 100] as const;

type Props = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function FuturePremiumListPagination({
  page,
  pageSize,
  total,
  totalPages,
  loading = false,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const safeTotalPages = Math.max(1, totalPages);

  return (
    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">
        {total > 0 ? (
          <>
            <span className="text-foreground font-medium">{total.toLocaleString("en-IN")}</span>{" "}
            policies total
          </>
        ) : (
          "No policies to show"
        )}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <Label htmlFor="future-premium-page-size" className="text-muted-foreground whitespace-nowrap text-xs">
            Rows per page
          </Label>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
            disabled={loading}
          >
            <SelectTrigger id="future-premium-page-size" className="h-8 w-[72px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FUTURE_PREMIUM_PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-muted-foreground whitespace-nowrap text-sm">
          Page <span className="text-foreground font-semibold">{page}</span> of{" "}
          <span className="text-foreground font-semibold">{safeTotalPages}</span>
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            className="size-8 p-0"
            onClick={() => onPageChange(1)}
            disabled={page <= 1 || loading}
          >
            <span className="sr-only">First page</span>
            <ChevronsLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="size-8 p-0"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
          >
            <span className="sr-only">Previous page</span>
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="size-8 p-0"
            onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
            disabled={page >= safeTotalPages || loading}
          >
            <span className="sr-only">Next page</span>
            <ChevronRight className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="size-8 p-0"
            onClick={() => onPageChange(safeTotalPages)}
            disabled={page >= safeTotalPages || loading}
          >
            <span className="sr-only">Last page</span>
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
