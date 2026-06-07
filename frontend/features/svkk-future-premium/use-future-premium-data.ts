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
  const [policyExportRows, setPolicyExportRows] = useState<CsvRowObject[] | null>(null);

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

  const fetchPolicyExportRows = useCallback(async (): Promise<CsvRowObject[]> => {
    if (policyExportRows) return policyExportRows;
    setLoadingPolicies(true);
    try {
      const res = await backendApi.get("/policies/export.csv", { responseType: "text" });
      const rows = parseCsvFileText(String(res.data ?? ""));
      setPolicyExportRows(rows);
      return rows;
    } finally {
      setLoadingPolicies(false);
    }
  }, [policyExportRows]);

  return {
    premiumState,
    uploadedRows,
    loadingCharts,
    loadingPolicies,
    ingestCsvFile,
    fetchPolicyExportRows,
    clearPolicyExportCache: () => setPolicyExportRows(null),
  };
}
