"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

export type PolicyFilterOption = { value: string; label: string };

type PolicyFilterMultiProps = {
  label: string;
  placeholder: string;
  options: PolicyFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Outer card: border + soft gradient */
  accentClassName: string;
  /** Merged onto popover content (e.g. taller list for many options). */
  popoverContentClassName?: string;
};

export function PolicyFilterMulti({
  label,
  placeholder,
  options,
  selected,
  onChange,
  accentClassName,
  popoverContentClassName,
}: PolicyFilterMultiProps) {
  const [open, setOpen] = useState(false);
  const sortedSelected = useMemo(() => [...selected].sort(), [selected]);

  const summary =
    sortedSelected.length === 0
      ? placeholder
      : sortedSelected.length === 1
        ? options.find((o) => o.value === sortedSelected[0])?.label ?? sortedSelected[0]
        : `${sortedSelected.length} selected`;

  function toggle(value: string) {
    const set = new Set(selected);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange([...set]);
  }

  return (
    <div
      className={cn(
        "rounded-xl border-2 bg-gradient-to-br p-3 shadow-sm transition-shadow hover:shadow-md",
        accentClassName,
      )}
    >
      <Label className="text-foreground/90 mb-2 block text-xs font-bold tracking-wide">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="border-input/80 bg-background/90 hover:bg-background h-10 w-full justify-between gap-2 px-3 font-bold shadow-sm"
            aria-expanded={open}
          >
            <span className={cn("truncate text-left text-sm font-bold", sortedSelected.length === 0 && "text-muted-foreground")}>
              {summary}
            </span>
            <ChevronDown className="text-muted-foreground size-4 shrink-0 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={cn(
            "w-[var(--radix-popover-trigger-width)] max-h-72 overflow-y-auto overflow-x-hidden p-2",
            popoverContentClassName,
          )}
          align="start"
        >
          <div className="flex flex-col gap-0.5">
            {options.length === 0 ? (
              <p className="text-muted-foreground px-2 py-3 text-center text-xs">No options</p>
            ) : (
              options.map((opt) => {
                const checked = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={cn(
                      "hover:bg-muted/80 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                      checked && "bg-muted/60",
                    )}
                    onClick={() => toggle(opt.value)}
                  >
                    <Checkbox checked={checked} className="pointer-events-none" />
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 ? (
            <div className="border-t mt-2 pt-2">
              <Button type="button" variant="ghost" size="sm" className="h-8 w-full text-xs" onClick={() => onChange([])}>
                Clear
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
