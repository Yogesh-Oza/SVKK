"use client";

import { useCallback, useEffect, useState } from "react";
import { svkkJson } from "@/lib/svkk/api";
import { getSvkkApiBase } from "@/lib/svkk/config";
import {
  DROPDOWN_TYPES,
  emptyDropdownOptionsMap,
  type DropdownOption,
  type DropdownOptionsMap,
  type DropdownType,
} from "@/lib/svkk/dropdown-options";

export type ExtraDropdowns = {
  categories: DropdownOption[];
  policyGroupings: DropdownOption[];
};

export type DropdownOptionsState = DropdownOptionsMap & ExtraDropdowns;

let cachePromise: Promise<DropdownOptionsState> | null = null;
let cacheValue: DropdownOptionsState | null = null;
const subscribers = new Set<(map: DropdownOptionsState) => void>();

function emptyState(): DropdownOptionsState {
  return { ...emptyDropdownOptionsMap(), categories: [], policyGroupings: [] };
}

async function fetchAll(): Promise<DropdownOptionsState> {
  const [generic, categoriesRes, groupingsRes] = await Promise.all([
    svkkJson<{ items: Partial<Record<DropdownType, DropdownOption[]>> }>("/dropdowns"),
    svkkJson<{ items: Array<{ key: string; name: string }> }>("/categories").catch(() => ({
      items: [],
    })),
    svkkJson<{ items: Array<{ name: string }> }>("/dropdowns/policy-groupings").catch(() => ({
      items: [],
    })),
  ]);
  const map = emptyState();
  for (const t of DROPDOWN_TYPES) {
    map[t] = generic.items?.[t] ?? [];
  }
  map.categories = (categoriesRes.items ?? []).map((c) => ({
    value: (c.key ?? "").toUpperCase(),
    label: c.name ?? c.key ?? "",
  }));
  map.policyGroupings = (groupingsRes.items ?? []).map((g) => ({ value: g.name, label: g.name }));
  return map;
}

function notifyAll(map: DropdownOptionsState) {
  for (const fn of subscribers) fn(map);
}

/**
 * Bust the in-memory cache and re-fetch. Call after admin mutates a dropdown
 * so any open form picks up the new options.
 */
export async function refreshDropdownOptions(): Promise<DropdownOptionsState> {
  cachePromise = null;
  cacheValue = null;
  const map = await fetchAll();
  cacheValue = map;
  cachePromise = Promise.resolve(map);
  notifyAll(map);
  return map;
}

/**
 * Process-wide cached fetch of all dropdown options. Call this once per app
 * lifecycle, then read individual lists from the returned map.
 */
export function useDropdownOptions() {
  const [options, setOptions] = useState<DropdownOptionsState>(() => cacheValue ?? emptyState());
  const [loading, setLoading] = useState<boolean>(() => cacheValue == null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getSvkkApiBase()) {
      setLoading(false);
      return;
    }
    const handler = (map: DropdownOptionsState) => setOptions(map);
    subscribers.add(handler);

    if (!cachePromise) {
      cachePromise = fetchAll();
    }
    let cancelled = false;
    setLoading(true);
    cachePromise
      .then((map) => {
        cacheValue = map;
        if (!cancelled) {
          setOptions(map);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load dropdown options");
        setLoading(false);
      });

    return () => {
      cancelled = true;
      subscribers.delete(handler);
    };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const map = await refreshDropdownOptions();
      setOptions(map);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dropdown options");
    } finally {
      setLoading(false);
    }
  }, []);

  return { options, loading, error, reload };
}
