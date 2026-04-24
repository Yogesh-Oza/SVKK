"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { LEAD_STAGES } from "../types/lead.types";

interface LeadTableToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  stage: string;
  onStageChange: (value: string) => void;
  onAddLead: () => void;
}

export function LeadTableToolbar({
  search,
  onSearchChange,
  stage,
  onStageChange,
  onAddLead,
}: LeadTableToolbarProps) {
  const isFiltered = search.length > 0 || stage.length > 0;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-[200px] pl-8 lg:w-[280px]"
          />
        </div>
        <Select value={stage || "all"} onValueChange={(v) => onStageChange(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-[140px] cursor-pointer">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="cursor-pointer">
              All stages
            </SelectItem>
            {LEAD_STAGES.map((s) => (
              <SelectItem key={s} value={s} className="cursor-pointer capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => {
              onSearchChange("");
              onStageChange("");
            }}
            className="h-9 px-3"
          >
            Reset
            <X className="ml-1 size-4" />
          </Button>
        )}
      </div>
      <Button onClick={onAddLead} className="cursor-pointer">
        Add Lead
      </Button>
    </div>
  );
}
