"use client";

import { LeadTable, type LeadRow } from "@/features/leads/components/lead-table";
import { useEffect, useState } from "react";

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (search) params.set("search", search);
      if (stage) params.set("stage", stage);

      const res = await fetch(`/api/leads?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setLeads([]);
        setTotal(0);
        return;
      }

      setLeads(json.leads ?? []);
      setTotal(json.total ?? 0);
    } catch {
      setLeads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [page, search, stage]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => {
        setIsAdmin(data.role === "admin");
      })
      .catch(() => setIsAdmin(false));
  }, []);

  return (
    <>
      <div className="px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">
            Manage your leads and track their progress through the sales pipeline.
          </p>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        {loading && page === 1 ? (
          <div className="rounded-md border p-8 text-center text-muted-foreground">
            Loading leads...
          </div>
        ) : (
          <LeadTable
            leads={leads}
            total={total}
            page={page}
            limit={limit}
            search={search}
            stage={stage}
            onSearchChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            onStageChange={(v) => {
              setStage(v);
              setPage(1);
            }}
            onPageChange={setPage}
            onRefresh={fetchLeads}
            isAdmin={isAdmin}
          />
        )}
      </div>
    </>
  );
}
