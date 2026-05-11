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
import { useEffect, useMemo, useState } from "react";
import {
  DROPDOWN_TYPES,
  DROPDOWN_TYPE_LABELS,
  type DropdownType,
} from "@/lib/svkk/dropdown-options";
import { refreshDropdownOptions } from "@/lib/svkk/use-dropdown-options";

type PolicyType = { id: string; name: string; key: string; chartMode: "SINGLE" | "COMBINED"; description?: string | null };
type CategoryType = "GOV" | "PRIVATE" | "SCHEME";
type CategoryItem = { id: string; key: string; name: string; type: CategoryType };
type GroupingItem = { id: string; name: string };
type DropdownItem = {
  id: string;
  type: DropdownType;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
};

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

  const [dropdowns, setDropdowns] = useState<DropdownItem[]>([]);
  const [selectedDdType, setSelectedDdType] = useState<DropdownType>("AREA");
  const [newDd, setNewDd] = useState({ value: "", label: "", sortOrder: "0" });

  const missingUrl = !getSvkkApiBase();

  async function loadAll() {
    const [typeRows, categoryRes, groupingRes, dropdownRes] = await Promise.all([
      svkkJson<PolicyType[]>("/admin/policy-types"),
      svkkJson<{ items: CategoryItem[] }>("/admin/categories"),
      svkkJson<{ items: GroupingItem[] }>("/admin/policy-groupings"),
      svkkJson<{ items: DropdownItem[] }>("/admin/dropdowns"),
    ]);
    setTypes(typeRows);
    setCategories(categoryRes.items);
    setGroupings(groupingRes.items);
    setDropdowns(dropdownRes.items);
  }

  const filteredDropdowns = useMemo(
    () => dropdowns.filter((d) => d.type === selectedDdType),
    [dropdowns, selectedDdType],
  );

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

  async function guarded(action: () => Promise<void>, options?: { refreshDropdowns?: boolean }) {
    setBusy(true);
    setErr(null);
    try {
      await action();
      await loadAll();
      if (options?.refreshDropdowns) {
        await refreshDropdownOptions();
      }
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
          <TabsTrigger value="dropdowns">Form Dropdowns</TabsTrigger>
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
                  }, { refreshDropdowns: true })
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
                }, { refreshDropdowns: true })}>Save</Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void guarded(async () => {
                  await svkkJson(`/admin/categories/${c.id}`, { method: "DELETE" });
                }, { refreshDropdowns: true })}>Delete</Button>
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
                }, { refreshDropdowns: true })
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
                }, { refreshDropdowns: true })}>Save</Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void guarded(async () => {
                  await svkkJson(`/admin/policy-groupings/${g.id}`, { method: "DELETE" });
                }, { refreshDropdowns: true })}>Delete</Button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="dropdowns" className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Manage every admin-editable dropdown used by the policy form. Changes appear immediately for everyone.
          </p>
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="rounded-lg border p-2">
              <div className="text-muted-foreground mb-2 px-2 text-xs font-medium uppercase">
                Dropdown
              </div>
              <div className="flex flex-col gap-1">
                {DROPDOWN_TYPES.map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant={selectedDdType === t ? "default" : "ghost"}
                    size="sm"
                    className="justify-start"
                    onClick={() => setSelectedDdType(t)}
                  >
                    <span className="truncate">{DROPDOWN_TYPE_LABELS[t]}</span>
                    <span className="text-muted-foreground ml-auto text-xs">
                      {dropdowns.filter((d) => d.type === t).length}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border p-3">
                <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                  Add to: {DROPDOWN_TYPE_LABELS[selectedDdType]}
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                  <div>
                    <Label>Value</Label>
                    <Input
                      value={newDd.value}
                      onChange={(e) => setNewDd((p) => ({ ...p, value: e.target.value }))}
                      placeholder="Stored code (e.g. JAMNAGAR)"
                    />
                  </div>
                  <div>
                    <Label>Label</Label>
                    <Input
                      value={newDd.label}
                      onChange={(e) => setNewDd((p) => ({ ...p, label: e.target.value }))}
                      placeholder="Shown to user (e.g. Jamnagar)"
                    />
                  </div>
                  <div>
                    <Label>Sort</Label>
                    <Input
                      value={newDd.sortOrder}
                      onChange={(e) => setNewDd((p) => ({ ...p, sortOrder: e.target.value }))}
                      inputMode="numeric"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      disabled={busy || !newDd.value.trim() || !newDd.label.trim()}
                      onClick={() =>
                        void guarded(async () => {
                          await svkkJson("/admin/dropdowns", {
                            method: "POST",
                            body: JSON.stringify({
                              type: selectedDdType,
                              value: newDd.value.trim(),
                              label: newDd.label.trim(),
                              sortOrder: Number(newDd.sortOrder) || 0,
                            }),
                          });
                          setNewDd({ value: "", label: "", sortOrder: "0" });
                        }, { refreshDropdowns: true })
                      }
                    >
                      Add Option
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {filteredDropdowns.length === 0 ? (
                  <p className="text-muted-foreground rounded border p-3 text-sm">
                    No options yet. Add one above.
                  </p>
                ) : null}
                {filteredDropdowns.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
                    <Input
                      className="max-w-[160px]"
                      value={d.value}
                      onChange={(e) =>
                        setDropdowns((prev) =>
                          prev.map((x) => (x.id === d.id ? { ...x, value: e.target.value } : x)),
                        )
                      }
                    />
                    <Input
                      className="max-w-[220px]"
                      value={d.label}
                      onChange={(e) =>
                        setDropdowns((prev) =>
                          prev.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)),
                        )
                      }
                    />
                    <Input
                      className="max-w-[80px]"
                      inputMode="numeric"
                      value={String(d.sortOrder)}
                      onChange={(e) =>
                        setDropdowns((prev) =>
                          prev.map((x) =>
                            x.id === d.id ? { ...x, sortOrder: Number(e.target.value) || 0 } : x,
                          ),
                        )
                      }
                    />
                    <Select
                      value={d.isActive ? "active" : "inactive"}
                      onValueChange={(v) =>
                        setDropdowns((prev) =>
                          prev.map((x) =>
                            x.id === d.id ? { ...x, isActive: v === "active" } : x,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    {d.isSystem ? (
                      <span className="text-muted-foreground text-xs uppercase">system</span>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void guarded(async () => {
                          await svkkJson(`/admin/dropdowns/${d.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              value: d.value,
                              label: d.label,
                              sortOrder: d.sortOrder,
                              isActive: d.isActive,
                            }),
                          });
                        }, { refreshDropdowns: true })
                      }
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() =>
                        void guarded(async () => {
                          await svkkJson(`/admin/dropdowns/${d.id}`, { method: "DELETE" });
                        }, { refreshDropdowns: true })
                      }
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
