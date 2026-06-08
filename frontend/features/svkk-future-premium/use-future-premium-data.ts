"use client";

import { useCallback, useEffect, useState } from "react";

import { backendApi } from "@/lib/svkk/api";
import { fetchPremiumSnapshot, type PremiumState } from "@/lib/svkk/premium";
import { parseCsvFileText } from "./future-csv-utils";
import type { CsvRowObject } from "./future-premium-types";
import { loadUploadedFutureRows, saveUploadedFutureRows } from "./future-premium-storage";

export function useFuturePremiumData() {
  const [premiumState, setPremiumState] = useState<PremiumState | null>(null);
  const [uploadedRows, setUploadedRows] = useState<CsvRowObject[]>([]);
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [loadingPolicies, setLoadingPolicies] = useState(false);

  useEffect(() => {
    setUploadedRows(loadUploadedFutureRows());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCharts(true);
      try {
        const next = await fetchPremiumSnapshot();
        if (!cancelled) setPremiumState(next);
      } finally {
        if (!cancelled) setLoadingCharts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  return {
    premiumState,
    uploadedRows,
    loadingCharts,
    loadingPolicies,
    ingestCsvFile,
    fetchPolicyExportRows,
  };
}
