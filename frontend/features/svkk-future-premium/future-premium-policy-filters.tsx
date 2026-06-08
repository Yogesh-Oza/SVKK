"use client";

import { useEffect, useMemo, useState } from "react";

import {
  PolicyFilterMulti,
  type PolicyFilterOption,
} from "@/features/svkk-policies/policy-filter-multi";
import { svkkJson } from "@/lib/svkk/api";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { monthFilterOptionsFromMeta } from "@/lib/svkk/policy-period-months";
import { useDropdownOptions } from "@/lib/svkk/use-dropdown-options";

import {
  buildFuturePolicyFilterQuery,
  countActiveFuturePolicyFilters,
  emptyFuturePolicyFilters,
  type FutureCsvFilterContext,
  type FuturePolicyFilters,
} from "./future-policy-filters";

type FiltersMeta = {
  villages: string[];
  areas: string[];
  sumInsuredValues: string[];
  periodYearTexts: string[];
  periodMonthTexts: string[];
  policyGroupings: string[];
};

export type CategoryItem = { id: string; key: string; name: string };

export function useFuturePremiumPolicyFilters() {
  const missingUrl = !getSvkkApiBase();
  const { options: ddOptions } = useDropdownOptions();
  const [filters, setFilters] = useState<FuturePolicyFilters>(emptyFuturePolicyFilters);
  const [meta, setMeta] = useState<FiltersMeta | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  useEffect(() => {
    if (missingUrl) return;
    void (async () => {
      try {
        const [f, cat] = await Promise.all([
          svkkJson<FiltersMeta>("/policies/filters"),
          svkkJson<{ items: CategoryItem[] }>("/categories"),
        ]);
        setMeta(f);
        setCategories(cat.items ?? []);
      } catch {
        /* non-fatal */
      }
    })();
  }, [missingUrl]);

  const categoryKeys = useMemo(
    () =>
      [
        ...new Set(
          filters.categoryIds
            .map((id) => categories.find((c) => c.id === id)?.key?.trim())
            .filter((k): k is string => Boolean(k)),
        ),
      ],
    [filters.categoryIds, categories],
  );

  const filterQuery = useMemo(
    () => buildFuturePolicyFilterQuery(filters, categoryKeys),
    [filters, categoryKeys],
  );

  const csvFilterContext = useMemo<FutureCsvFilterContext>(() => {
    const categoryLabels = filters.categoryIds
      .map((id) => {
        const c = categories.find((x) => x.id === id);
        return c ? `${c.key} — ${c.name}` : "";
      })
      .filter(Boolean);
    const selectedTypes = ddOptions.policyTypes.filter(
      (t): t is typeof t & { id: string } =>
        Boolean(t.id) && filters.policyTypeIds.includes(t.id!),
    );
    return {
      categoryKeys,
      categoryLabels: [...new Set(categoryLabels)],
      policyTypeKeys: selectedTypes.map((t) => t.value),
      policyTypeLabels: selectedTypes.map((t) => t.label || t.value),
    };
  }, [filters.categoryIds, filters.policyTypeIds, categories, categoryKeys, ddOptions.policyTypes]);

  const yearOptions = useMemo<PolicyFilterOption[]>(
    () => (meta?.periodYearTexts ?? []).map((v) => ({ value: v, label: v })),
    [meta?.periodYearTexts],
  );
  const monthOptions = useMemo(
    () => monthFilterOptionsFromMeta(meta?.periodMonthTexts ?? []),
    [meta?.periodMonthTexts],
  );
  const areaOptions = useMemo<PolicyFilterOption[]>(
    () => (meta?.areas ?? []).map((v) => ({ value: v, label: v })),
    [meta?.areas],
  );
  const villageOptions = useMemo<PolicyFilterOption[]>(
    () => (meta?.villages ?? []).map((v) => ({ value: v, label: v })),
    [meta?.villages],
  );
  const sumInsuredOptions = useMemo<PolicyFilterOption[]>(
    () => (meta?.sumInsuredValues ?? []).map((v) => ({ value: v, label: v })),
    [meta?.sumInsuredValues],
  );
  const groupingOptions = useMemo<PolicyFilterOption[]>(
    () => (meta?.policyGroupings ?? []).map((g) => ({ value: g, label: g })),
    [meta?.policyGroupings],
  );
  const categoryOptions = useMemo<PolicyFilterOption[]>(
    () => categories.map((c) => ({ value: c.id, label: `${c.key} — ${c.name}` })),
    [categories],
  );
  const policyTypeFilterOptions = useMemo<PolicyFilterOption[]>(
    () =>
      ddOptions.policyTypes
        .filter((t): t is typeof t & { id: string } => Boolean(t.id))
        .map((t) => ({ value: t.id, label: t.label || t.value })),
    [ddOptions.policyTypes],
  );

  return {
    filters,
    setFilters,
    resetFilters: () => setFilters(emptyFuturePolicyFilters()),
    activeCount: countActiveFuturePolicyFilters(filters),
    filterQuery,
    csvFilterContext,
    filterOptions: {
      yearOptions,
      monthOptions,
      areaOptions,
      villageOptions,
      sumInsuredOptions,
      groupingOptions,
      categoryOptions,
      policyTypeFilterOptions,
    },
  };
}

export function FuturePremiumPolicyFilters({
  filters,
  onChange,
  options,
  activeCount,
  onReset,
}: {
  filters: FuturePolicyFilters;
  onChange: (next: FuturePolicyFilters) => void;
  activeCount: number;
  onReset: () => void;
  options: ReturnType<typeof useFuturePremiumPolicyFilters>["filterOptions"];
}) {
  const patch = (partial: Partial<FuturePolicyFilters>) => onChange({ ...filters, ...partial });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Narrow policies by year, category, type, and location — same filters as the policy list.
        </p>
        <div className="flex items-center gap-2">
          {activeCount > 0 ? (
            <span className="text-muted-foreground text-xs">{activeCount} filter(s) active</span>
          ) : null}
          <button
            type="button"
            className="text-primary text-xs font-medium hover:underline"
            onClick={onReset}
          >
            Reset filters
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PolicyFilterMulti
          label="Year"
          placeholder="All years"
          options={options.yearOptions}
          selected={filters.periodYears}
          onChange={(periodYears) => patch({ periodYears })}
          accentClassName="border-amber-200/90 from-amber-50/95 to-card dark:border-amber-900/50 dark:from-amber-950/35 dark:to-card"
        />
        <PolicyFilterMulti
          label="Category"
          placeholder="All categories"
          options={options.categoryOptions}
          selected={filters.categoryIds}
          onChange={(categoryIds) => patch({ categoryIds })}
          accentClassName="border-violet-200/90 from-violet-50/95 to-card dark:border-violet-900/50 dark:from-violet-950/35 dark:to-card"
        />
        <PolicyFilterMulti
          label="Policy type (product)"
          placeholder="All types"
          options={options.policyTypeFilterOptions}
          selected={filters.policyTypeIds}
          onChange={(policyTypeIds) => patch({ policyTypeIds })}
          accentClassName="border-rose-200/90 from-rose-50/95 to-card dark:border-rose-900/50 dark:from-rose-950/35 dark:to-card"
        />
        <PolicyFilterMulti
          label="Month"
          placeholder="All months"
          options={options.monthOptions}
          selected={filters.periodMonths}
          onChange={(periodMonths) => patch({ periodMonths })}
          accentClassName="border-sky-200/90 from-sky-50/95 to-card dark:border-sky-900/50 dark:from-sky-950/35 dark:to-card"
          popoverContentClassName="max-h-[min(22rem,70vh)]"
        />
        <PolicyFilterMulti
          label="Area"
          placeholder="All areas"
          options={options.areaOptions}
          selected={filters.areas}
          onChange={(areas) => patch({ areas })}
          accentClassName="border-teal-200/90 from-teal-50/95 to-card dark:border-teal-900/50 dark:from-teal-950/35 dark:to-card"
        />
        <PolicyFilterMulti
          label="Village"
          placeholder="All villages"
          options={options.villageOptions}
          selected={filters.villages}
          onChange={(villages) => patch({ villages })}
          accentClassName="border-emerald-200/90 from-emerald-50/95 to-card dark:border-emerald-900/50 dark:from-emerald-950/35 dark:to-card"
        />
        <PolicyFilterMulti
          label="Sum insured"
          placeholder="All SI"
          options={options.sumInsuredOptions}
          selected={filters.sumInsureds}
          onChange={(sumInsureds) => patch({ sumInsureds })}
          accentClassName="border-orange-200/90 from-orange-50/95 to-card dark:border-orange-900/50 dark:from-orange-950/35 dark:to-card"
        />
        <PolicyFilterMulti
          label="Group"
          placeholder="All groups"
          options={options.groupingOptions}
          selected={filters.policyGroupings}
          onChange={(policyGroupings) => patch({ policyGroupings })}
          accentClassName="border-indigo-200/90 from-indigo-50/95 to-card dark:border-indigo-900/50 dark:from-indigo-950/35 dark:to-card"
        />
      </div>
    </div>
  );
}
