"use client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { DropdownOption } from "@/lib/svkk/dropdown-options";

export type DropdownComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Show an "All" / "Select…" reset entry at the top. */
  showClear?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
};

export function DropdownCombobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results",
  showClear = true,
  clearLabel = "—",
  disabled,
  className,
  id,
}: DropdownComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );
  // Persisted value that isn't (anymore) in the option list: still surface it
  // so the user knows what's saved.
  const displayLabel = selected
    ? selected.label
    : value
      ? value
      : placeholder;
  const isPlaceholder = !value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            isPlaceholder && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-[220px] p-0"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {showClear ? (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 size-4", !value ? "opacity-100" : "opacity-0")} />
                  {clearLabel}
                </CommandItem>
              ) : null}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      o.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
