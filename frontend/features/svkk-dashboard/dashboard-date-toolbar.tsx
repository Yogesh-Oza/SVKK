"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PolicyDateInput } from "@/features/svkk-policies/policy-date-input";
import {
  DASHBOARD_DATE_PRESETS,
  type DashboardDatePreset,
  type DashboardDateRange,
  formatRangeSubtitle,
} from "@/lib/svkk/dashboard-date-presets";
import { cn } from "@/lib/utils";

type Props = {
  preset: DashboardDatePreset;
  range: DashboardDateRange;
  customFrom: string;
  customTo: string;
  onPresetChange: (preset: DashboardDatePreset) => void;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
};

export function DashboardDateToolbar({
  preset,
  range,
  customFrom,
  customTo,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}: Props) {
  return (
    <div className="space-y-3 rounded-2xl border border-[#d9e3ee]/90 bg-[#f8fbff]/80 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#0b1728]">Report period</p>
          <p className="text-muted-foreground text-xs">{formatRangeSubtitle(range)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DASHBOARD_DATE_PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              size="sm"
              variant={preset === p.id ? "default" : "outline"}
              className={cn("cursor-pointer", preset === p.id && "shadow-sm")}
              onClick={() => onPresetChange(p.id)}
            >
              {p.label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={preset === "custom" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => onPresetChange("custom")}
          >
            Custom
          </Button>
        </div>
      </div>
      {preset === "custom" ? (
        <div className="grid gap-3 sm:grid-cols-2 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="dash-from" className="text-xs">
              From date
            </Label>
            <PolicyDateInput
              id="dash-from"
              value={customFrom}
              onValueChange={onCustomFromChange}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dash-to" className="text-xs">
              To date
            </Label>
            <PolicyDateInput
              id="dash-to"
              value={customTo}
              onValueChange={onCustomToChange}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
