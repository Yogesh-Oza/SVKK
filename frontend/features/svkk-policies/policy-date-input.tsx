"use client";

import { Input } from "@/components/ui/input";
import {
  FORM_DATE_PLACEHOLDER,
  formatDateForFormInput,
  formatDateWhileTyping,
} from "@/lib/svkk/form-date";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Input>, "type" | "onChange" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
};

/** Manual date field with auto `DD-MM-YYYY` separators while typing. */
export function PolicyDateInput({ value, onValueChange, onBlur, ...props }: Props) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={props.placeholder ?? FORM_DATE_PLACEHOLDER}
      value={value}
      onChange={(e) => onValueChange(formatDateWhileTyping(e.target.value))}
      onBlur={(e) => {
        const normalized = formatDateForFormInput(e.target.value);
        if (normalized && normalized !== e.target.value) {
          onValueChange(normalized);
        }
        onBlur?.(e);
      }}
    />
  );
}
