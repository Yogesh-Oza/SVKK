"use client";

import { useCallback, useEffect, useState } from "react";

import { backendApi } from "@/lib/svkk/api";
import { fetchPremiumSnapshotWithOffline } from "@/lib/svkk/offline/offline-reference";
import { fetchPremiumSnapshot, type PremiumState } from "@/lib/svkk/premium";
import { parseCsvFileText } from "./future-csv-utils";
import type { CsvRowObject } from "./future-premium-types";

export type PolicyExportPageResponse = {
  items: CsvRowObject[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
import { loadUploadedFutureRows, saveUploadedFutureRows } from "./future-premium-storage";

export function useFuturePremiumData() {
  const [premiumState, setPremiumState] = useState<PremiumState | null>(null);
  const [uploadedRows, setUploadedRows] = useState<CsvRowObject[]>([]);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [chartsLoadError, setChartsLoadError] = useState<string | null>(null);
  const [loadingPolicies, setLoadingPolicies] = useState(false);

  const loadPremiumCharts = useCallback(async () => {
    setLoadingCharts(true);
    setChartsLoadError(null);
    try {
      const next = await fetchPremiumSnapshotWithOffline();
      if (!next || !Object.keys(next.defs).length) {
        throw new Error("No premium charts are configured. Open Charts & discounts to set them up.");
      }
      setPremiumState(next);
      return next;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load premium charts";
      setPremiumState(null);
      setChartsLoadError(msg);
      return null;
    } finally {
      setLoadingCharts(false);
    }
  }, []);

  useEffect(() => {
    setUploadedRows(loadUploadedFutureRows());
  }, []);

  useEffect(() => {
    void loadPremiumCharts();
  }, [loadPremiumCharts]);

  const persistUploadedRows = useCallback((rows: CsvRowObject[]) => {
    setUploadedRows(rows);
    saveUploadedFutureRows(rows);
  }, []);

  const ingestCsvFile = useCallback(
    async (file: File) => {
      const text = await file.text();
      const rows = parseCsvFileText(text);
      persistUploadedRows(rows);
      return rows.length;
    },
    [persistUploadedRows],
  );

  const fetchPolicyExportRows = useCallback(async (filterQuery = ""): Promise<CsvRowObject[]> => {
    setLoadingPolicies(true);
    try {
      const path = filterQuery
        ? `/policies/export.csv?${filterQuery}`
        : "/policies/export.csv";
      const res = await backendApi.get(path, { responseType: "text" });
      return parseCsvFileText(String(res.data ?? ""));
    } finally {
      setLoadingPolicies(false);
    }
  }, []);

  const fetchPolicyExportPage = useCallback(
    async (
      filterQuery: string,
      page: number,
      pageSize: number,
    ): Promise<PolicyExportPageResponse> => {
      setLoadingPolicies(true);
      try {
        const params = new URLSearchParams(filterQuery);
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        const qs = params.toString();
        const path = qs ? `/policies/export.json?${qs}` : `/policies/export.json?page=${page}&pageSize=${pageSize}`;
        const res = await backendApi.get<PolicyExportPageResponse>(path);
        return res.data;
      } finally {
        setLoadingPolicies(false);
      }
    },
    [],
  );

  return {
    premiumState,
    uploadedRows,
    loadingCharts,
    chartsLoadError,
    loadingPolicies,
    ingestCsvFile,
    fetchPolicyExportRows,
    fetchPolicyExportPage,
    loadPremiumCharts,
    persistUploadedRows,
  };
}
