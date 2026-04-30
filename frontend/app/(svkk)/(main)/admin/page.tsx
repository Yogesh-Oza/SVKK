"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { useEffect, useState } from "react";

type PolicyType = { id: string; name: string; key: string; chartMode: "SINGLE" | "COMBINED"; description?: string | null };
type CategoryType = "GOV" | "PRIVATE" | "SCHEME";
type CategoryItem = { id: string; key: string; name: string; type: CategoryType };
type GroupingItem = { id: string; name: string };

export default function SvkkAdminPage() {
  const { user } = useSvkkAuth();
  const [types, setTypes] = useState<PolicyType[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [groupings, setGroupings] = useState<GroupingItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [newType, setNewType] = useState({ key: "", name: "", chartMode: "SINGLE" as "SINGLE" | "COMBINED" });
  const [newCategory, setNewCategory] = useState({ key: "", name: "", type: "GOV" as CategoryType });
  const [newGrouping, setNewGrouping] = useState("");

  const missingUrl = !getSvkkApiBase();

  async function loadAll() {
    const [typeRows, categoryRes, groupingRes] = await Promise.all([
      svkkJson<PolicyType[]>("/admin/policy-types"),
      svkkJson<{ items: CategoryItem[] }>("/admin/categories"),
      svkkJson<{ items: GroupingItem[] }>("/admin/policy-groupings"),
    ]);
    setTypes(typeRows);
    setCategories(categoryRes.items);
    setGroupings(groupingRes.items);
  }

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    if (user && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return;
    }
    void (async () => {
      try {
        await loadAll();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [missingUrl, user]);

  async function guarded(action: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await action();
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (user && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return <p className="text-muted-foreground text-sm">You do not have access to admin.</p>;
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin — Master Data</h1>
      <p className="text-muted-foreground text-sm">Manage categories, policy types, and policy groupings.</p>
      {err ? <p className="text-destructive text-sm">{err}</p> : null}

      <Tabs defaultValue="categories" className="space-y-4">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="policyTypes">Policy Types</TabsTrigger>
          <TabsTrigger value="groupings">Policy Groupings</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-3">
          <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-4">
            <div>
              <Label>Key</Label>
              <Input value={newCategory.key} onChange={(e) => setNewCategory((p) => ({ ...p, key: e.target.value }))} />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={newCategory.name} onChange={(e) => setNewCategory((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newCategory.type} onValueChange={(v: CategoryType) => setNewCategory((p) => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GOV">GOV</SelectItem>
                  <SelectItem value="PRIVATE">PRIVATE</SelectItem>
                  <SelectItem value="SCHEME">SCHEME</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                disabled={busy || !newCategory.key.trim() || !newCategory.name.trim()}
                onClick={() =>
                  void guarded(async () => {
                    await svkkJson("/admin/categories", { method: "POST", body: JSON.stringify(newCategory) });
                    setNewCategory({ key: "", name: "", type: "GOV" });
                  })
                }
              >
                Add Category
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                <Input className="max-w-[140px]" value={c.key} onChange={(e) => setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, key: e.target.value } : x)))} />
                <Input className="max-w-[220px]" value={c.name} onChange={(e) => setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} />
                <Select value={c.type} onValueChange={(v: CategoryType) => setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, type: v } : x)))}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GOV">GOV</SelectItem>
                    <SelectItem value="PRIVATE">PRIVATE</SelectItem>
                    <SelectItem value="SCHEME">SCHEME</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void guarded(async () => {
                  await svkkJson(`/admin/categories/${c.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ key: c.key, name: c.name, type: c.type }),
                  });
                })}>Save</Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void guarded(async () => {
                  await svkkJson(`/admin/categories/${c.id}`, { method: "DELETE" });
                })}>Delete</Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="policyTypes" className="space-y-3">
          <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-4">
            <div>
              <Label>Key</Label>
              <Input value={newType.key} onChange={(e) => setNewType((p) => ({ ...p, key: e.target.value }))} />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={newType.name} onChange={(e) => setNewType((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>Chart Mode</Label>
              <Select value={newType.chartMode} onValueChange={(v: "SINGLE" | "COMBINED") => setNewType((p) => ({ ...p, chartMode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE">SINGLE</SelectItem>
                  <SelectItem value="COMBINED">COMBINED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                disabled={busy || !newType.key.trim() || !newType.name.trim()}
                onClick={() =>
                  void guarded(async () => {
                    await svkkJson("/admin/policy-types", { method: "POST", body: JSON.stringify(newType) });
                    setNewType({ key: "", name: "", chartMode: "SINGLE" });
                  })
                }
              >
                Add Policy Type
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {types.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                <Input className="max-w-[160px]" value={t.key} onChange={(e) => setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, key: e.target.value } : x)))} />
                <Input className="max-w-[220px]" value={t.name} onChange={(e) => setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))} />
                <Select value={t.chartMode} onValueChange={(v: "SINGLE" | "COMBINED") => setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, chartMode: v } : x)))}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE">SINGLE</SelectItem>
                    <SelectItem value="COMBINED">COMBINED</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void guarded(async () => {
                  await svkkJson(`/admin/policy-types/${t.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ key: t.key, name: t.name, chartMode: t.chartMode }),
                  });
                })}>Save</Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void guarded(async () => {
                  await svkkJson(`/admin/policy-types/${t.id}`, { method: "DELETE" });
                })}>Delete</Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="groupings" className="space-y-3">
          <div className="flex gap-2 rounded-lg border p-3">
            <Input value={newGrouping} onChange={(e) => setNewGrouping(e.target.value)} placeholder="Grouping name" className="max-w-xs" />
            <Button
              disabled={busy || !newGrouping.trim()}
              onClick={() =>
                void guarded(async () => {
                  await svkkJson("/admin/policy-groupings", {
                    method: "POST",
                    body: JSON.stringify({ name: newGrouping.trim() }),
                  });
                  setNewGrouping("");
                })
              }
            >
              Add Grouping
            </Button>
          </div>
          <div className="space-y-2">
            {groupings.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                <Input className="max-w-[260px]" value={g.name} onChange={(e) => setGroupings((prev) => prev.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))} />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void guarded(async () => {
                  await svkkJson(`/admin/policy-groupings/${g.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ name: g.name }),
                  });
                })}>Save</Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void guarded(async () => {
                  await svkkJson(`/admin/policy-groupings/${g.id}`, { method: "DELETE" });
                })}>Delete</Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
