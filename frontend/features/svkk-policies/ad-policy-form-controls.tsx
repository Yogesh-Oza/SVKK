"use client";

import { getIn, type FormikErrors, type FormikTouched } from "formik";

import { Label } from "@/components/ui/label";
import type { AdPolicyFormValues } from "./ad-policy-form-values";

export function FormikError({
  name,
  errors,
  touched,
  submitCount = 0,
}: {
  name: string;
  errors: FormikErrors<AdPolicyFormValues>;
  touched: FormikTouched<AdPolicyFormValues>;
  submitCount?: number;
}) {
  const e = getIn(errors, name);
  const t = getIn(touched, name);
  if (e == null || e === "") {
    return null;
  }
  if (!t && submitCount < 1) {
    return null;
  }
  return <p className="text-destructive text-xs mt-0.5">{String(e)}</p>;
}

export function RequiredLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="gap-0.5">
      <span>{children}</span>
      <span className="text-destructive" aria-label="required">
        *
      </span>
    </Label>
  );
}
