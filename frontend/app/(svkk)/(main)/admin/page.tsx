"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  DROPDOWN_TYPES,
  DROPDOWN_TYPE_LABELS,
  type DropdownType,
} from "@/lib/svkk/dropdown-options";
import { refreshDropdownOptions } from "@/lib/svkk/use-dropdown-options";
import { getSvkkErrorMessage } from "@/features/users/utils/api-error";
import { toast } from "sonner";

type PolicyType = {
  id: string;
  name: string;
  key: string;
  chartMode: "SINGLE" | "COMBINED";
  description?: string | null;
};
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

type SelectedKind =
  | { kind: "category" }
  | { kind: "policyType" }
  | { kind: "grouping" }
  | { kind: "dropdown"; type: DropdownType };

const SIDEBAR_KINDS: Array<{ id: string; kind: SelectedKind; label: string }> = [
  { id: "category", kind: { kind: "category" }, label: "Categories" },
  { id: "policyType", kind: { kind: "policyType" }, label: "Policy Types" },
  { id: "grouping", kind: { kind: "grouping" }, label: "Policy Groupings" },
  ...DROPDOWN_TYPES.map((t) => ({
    id: `dropdown:${t}`,
    kind: { kind: "dropdown" as const, type: t },
    label: DROPDOWN_TYPE_LABELS[t],
  })),
];

function kindId(k: SelectedKind): string {
  return k.kind === "dropdown" ? `dropdown:${k.type}` : k.kind;
}

/** "Demo Test Name" -> "demo_test_name"; safe for use as a value/key. */
function toSnakeCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Editor form state used by the Add/Edit dialog. */
type EditorState = {
  open: boolean;
  mode: "create" | "edit";
  kind: SelectedKind;
  id?: string;
  label: string;
  value: string;
  sortOrder: string;
  categoryType: CategoryType;
  chartMode: "SINGLE" | "COMBINED";
  isActive: boolean;
  /** Locks value to auto-derived form (true for new entries, false when editing
   * an existing row so its persisted value stays stable). */
  autoValue: boolean;
};

const EMPTY_EDITOR: EditorState = {
  open: false,
  mode: "create",
  kind: { kind: "category" },
  label: "",
  value: "",
  sortOrder: "0",
  categoryType: "GOV",
  chartMode: "SINGLE",
  isActive: true,
  autoValue: true,
};

export default function SvkkAdminPage() {
  const { user } = useSvkkAuth();
  const [types, setTypes] = useState<PolicyType[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [groupings, setGroupings] = useState<GroupingItem[]>([]);
  const [dropdowns, setDropdowns] = useState<DropdownItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selected, setSelected] = useState<SelectedKind>({ kind: "category" });
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);

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
    () =>
      selected.kind === "dropdown"
        ? dropdowns
            .filter((d) => d.type === selected.type)
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
        : [],
    [dropdowns, selected],
  );

  const countByKindId = useMemo(() => {
    const out: Record<string, number> = {
      category: categories.length,
      policyType: types.length,
      grouping: groupings.length,
    };
    for (const t of DROPDOWN_TYPES) {
      out[`dropdown:${t}`] = dropdowns.filter((d) => d.type === t).length;
    }
    return out;
  }, [categories.length, types.length, groupings.length, dropdowns]);

  useEffect(() => {
    if (missingUrl) return;
    if (user && !user.permissions?.includes("admin:policyTypes") && !user.permissions?.includes("*:*")) return;
    void (async () => {
      try {
        await loadAll();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [missingUrl, user]);

  async function guarded(action: () => Promise<void>, opts?: { refreshDropdowns?: boolean }) {
    setBusy(true);
    setErr(null);
    try {
      await action();
      await loadAll();
      if (opts?.refreshDropdowns) await refreshDropdownOptions();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function nextSortFor(kind: SelectedKind): number {
    if (kind.kind === "dropdown") {
      const rows = dropdowns.filter((d) => d.type === kind.type);
      return rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.sortOrder)) + 1;
    }
    return 0;
  }

  function openCreate(kind: SelectedKind) {
    setEditor({
      ...EMPTY_EDITOR,
      open: true,
      mode: "create",
      kind,
      sortOrder: String(nextSortFor(kind)),
      autoValue: true,
    });
  }

  function openEditCategory(c: CategoryItem) {
    setEditor({
      open: true,
      mode: "edit",
      kind: { kind: "category" },
      id: c.id,
      label: c.name,
      value: c.key,
      sortOrder: "0",
      categoryType: c.type,
      chartMode: "SINGLE",
      isActive: true,
      autoValue: false,
    });
  }

  function openEditPolicyType(t: PolicyType) {
    setEditor({
      open: true,
      mode: "edit",
      kind: { kind: "policyType" },
      id: t.id,
      label: t.name,
      value: t.key,
      sortOrder: "0",
      categoryType: "GOV",
      chartMode: t.chartMode,
      isActive: true,
      autoValue: false,
    });
  }

  function openEditGrouping(g: GroupingItem) {
    setEditor({
      open: true,
      mode: "edit",
      kind: { kind: "grouping" },
      id: g.id,
      label: g.name,
      value: toSnakeCase(g.name),
      sortOrder: "0",
      categoryType: "GOV",
      chartMode: "SINGLE",
      isActive: true,
      autoValue: false,
    });
  }

  function openEditDropdown(d: DropdownItem) {
    setEditor({
      open: true,
      mode: "edit",
      kind: { kind: "dropdown", type: d.type },
      id: d.id,
      label: d.label,
      value: d.value,
      sortOrder: String(d.sortOrder),
      categoryType: "GOV",
      chartMode: "SINGLE",
      isActive: d.isActive,
      autoValue: false,
    });
  }

  function onLabelChange(next: string) {
    setEditor((s) => ({
      ...s,
      label: next,
      value: s.autoValue ? toSnakeCase(next) : s.value,
    }));
  }

  function closeEditor() {
    setEditor((s) => ({ ...s, open: false }));
  }

  async function submitEditor() {
    const e = editor;
    const sortNum = Number(e.sortOrder);
    const sortOrder = Number.isFinite(sortNum) ? Math.trunc(sortNum) : 0;
    const label = e.label.trim();
    const value = e.value.trim();
    if (!label || !value) {
      setErr("Label and value are required.");
      return;
    }

    if (e.kind.kind === "category") {
      await guarded(
        async () => {
          if (e.mode === "create") {
            await svkkJson("/admin/categories", {
              method: "POST",
              body: JSON.stringify({ key: value, name: label, type: e.categoryType }),
            });
          } else if (e.id) {
            await svkkJson(`/admin/categories/${e.id}`, {
              method: "PATCH",
              body: JSON.stringify({ key: value, name: label, type: e.categoryType }),
            });
          }
        },
        { refreshDropdowns: true },
      );
    } else if (e.kind.kind === "policyType") {
      await guarded(async () => {
        if (e.mode === "create") {
          await svkkJson("/admin/policy-types", {
            method: "POST",
            body: JSON.stringify({ key: value, name: label, chartMode: e.chartMode }),
          });
        } else if (e.id) {
          await svkkJson(`/admin/policy-types/${e.id}`, {
            method: "PATCH",
            body: JSON.stringify({ key: value, name: label, chartMode: e.chartMode }),
          });
        }
      });
    } else if (e.kind.kind === "grouping") {
      await guarded(
        async () => {
          if (e.mode === "create") {
            await svkkJson("/admin/policy-groupings", {
              method: "POST",
              body: JSON.stringify({ name: label }),
            });
          } else if (e.id) {
            await svkkJson(`/admin/policy-groupings/${e.id}`, {
              method: "PATCH",
              body: JSON.stringify({ name: label }),
            });
          }
        },
        { refreshDropdowns: true },
      );
    } else {
      const type = e.kind.type;
      await guarded(
        async () => {
          if (e.mode === "create") {
            await svkkJson("/admin/dropdowns", {
              method: "POST",
              body: JSON.stringify({
                type,
                value,
                label,
                sortOrder,
                isActive: e.isActive,
              }),
            });
          } else if (e.id) {
            await svkkJson(`/admin/dropdowns/${e.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                value,
                label,
                sortOrder,
                isActive: e.isActive,
              }),
            });
          }
        },
        { refreshDropdowns: true },
      );
    }
    closeEditor();
  }

  async function toggleDropdownActive(d: DropdownItem, next: boolean) {
    await guarded(
      async () => {
        await svkkJson(`/admin/dropdowns/${d.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: next }),
        });
      },
      { refreshDropdowns: true },
    );
  }

  async function deleteCategory(id: string) {
    await guarded(
      async () => {
        await svkkJson(`/admin/categories/${id}`, { method: "DELETE" });
      },
      { refreshDropdowns: true },
    );
  }
  async function deletePolicyType(id: string) {
    const label = types.find((t) => t.id === id)?.name ?? "Policy type";
    setBusy(true);
    try {
      await svkkJson(`/admin/policy-types/${id}`, { method: "DELETE" });
      toast.success(`"${label}" deleted`);
      await loadAll();
    } catch (e) {
      toast.warning(getSvkkErrorMessage(e, `Could not delete "${label}"`));
    } finally {
      setBusy(false);
    }
  }
  async function deleteGrouping(id: string) {
    await guarded(
      async () => {
        await svkkJson(`/admin/policy-groupings/${id}`, { method: "DELETE" });
      },
      { refreshDropdowns: true },
    );
  }
  async function deleteDropdown(id: string) {
    await guarded(
      async () => {
        await svkkJson(`/admin/dropdowns/${id}`, { method: "DELETE" });
      },
      { refreshDropdowns: true },
    );
  }

  if (
    user &&
    !user.permissions?.includes("admin:policyTypes") &&
    !user.permissions?.includes("*:*")
  ) {
    return <p className="text-muted-foreground text-sm">You do not have access to admin.</p>;
  }
  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  const selectedLabel =
    selected.kind === "category"
      ? "Categories"
      : selected.kind === "policyType"
        ? "Policy Types"
        : selected.kind === "grouping"
          ? "Policy Groupings"
          : DROPDOWN_TYPE_LABELS[selected.type];

  const editorKindLabel =
    editor.kind.kind === "category"
      ? "Category"
      : editor.kind.kind === "policyType"
        ? "Policy Type"
        : editor.kind.kind === "grouping"
          ? "Policy Grouping"
          : DROPDOWN_TYPE_LABELS[editor.kind.type];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dynamic Form Dropdowns</h1>
      <p className="text-muted-foreground text-sm">
        Manage every admin-editable dropdown used by the policy form. Changes appear
        immediately for everyone.
      </p>
      {err ? <p className="text-destructive text-sm">{err}</p> : null}

      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="rounded-lg border p-2">
          <div className="text-muted-foreground mb-2 px-2 text-xs font-medium uppercase">
            Dropdown
          </div>
          <div className="flex flex-col gap-1">
            {SIDEBAR_KINDS.map((sk) => (
              <Button
                key={sk.id}
                type="button"
                variant={kindId(selected) === sk.id ? "default" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={() => setSelected(sk.kind)}
              >
                <span className="truncate">{sk.label}</span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {countByKindId[sk.id] ?? 0}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-xs font-medium uppercase">
              {selectedLabel}
            </div>
            <Button size="sm" onClick={() => openCreate(selected)}>
              <Plus className="mr-1 size-4" /> Add {selectedLabel}
            </Button>
          </div>

          {selected.kind === "category" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-[140px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground text-sm">
                      No categories yet. Click "Add Categories".
                    </TableCell>
                  </TableRow>
                ) : (
                  categories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {c.key}
                      </TableCell>
                      <TableCell>{c.type}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-1"
                          disabled={busy}
                          onClick={() => openEditCategory(c)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void deleteCategory(c.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : null}

          {selected.kind === "policyType" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Chart Mode</TableHead>
                  <TableHead className="w-[140px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground text-sm">
                      No policy types yet. Click "Add Policy Types".
                    </TableCell>
                  </TableRow>
                ) : (
                  types.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {t.key}
                      </TableCell>
                      <TableCell>{t.chartMode}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-1"
                          disabled={busy}
                          onClick={() => openEditPolicyType(t)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void deletePolicyType(t.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : null}

          {selected.kind === "grouping" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[140px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground text-sm">
                      No groupings yet. Click "Add Policy Groupings".
                    </TableCell>
                  </TableRow>
                ) : (
                  groupings.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-1"
                          disabled={busy}
                          onClick={() => openEditGrouping(g)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void deleteGrouping(g.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : null}

          {selected.kind === "dropdown" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Sort</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[140px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDropdowns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-sm">
                      No options yet. Click "Add {selectedLabel}".
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDropdowns.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.sortOrder}</TableCell>
                      <TableCell className="font-medium">
                        {d.label}
                        {d.isSystem ? (
                          <span className="bg-muted text-muted-foreground ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase">
                            system
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {d.value}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={d.isActive}
                            disabled={busy}
                            onCheckedChange={(v) => void toggleDropdownActive(d, v)}
                          />
                          <span className="text-muted-foreground text-xs">
                            {d.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-1"
                          disabled={busy}
                          onClick={() => openEditDropdown(d)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() => void deleteDropdown(d.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : null}
        </div>
      </div>

      <Dialog open={editor.open} onOpenChange={(o) => (o ? null : closeEditor())}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              {editor.mode === "create" ? "Add" : "Edit"} {editorKindLabel}
            </DialogTitle>
            <DialogDescription>
              {editor.autoValue
                ? "Value is auto-generated from the label (lowercase snake_case)."
                : "Editing existing entry — value stays unchanged for backward compatibility."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                value={editor.label}
                onChange={(e) => onLabelChange(e.target.value)}
                placeholder="e.g. Jamnagar"
                autoFocus
              />
            </div>

            {editor.kind.kind !== "grouping" ? (
              <div className="space-y-1">
                <Label>{editor.kind.kind === "category" || editor.kind.kind === "policyType" ? "Key" : "Value"}</Label>
                <Input
                  value={editor.value}
                  readOnly
                  className="bg-muted font-mono text-xs"
                />
              </div>
            ) : null}

            {editor.kind.kind === "category" ? (
              <div className="space-y-1">
                <Label>Type</Label>
                <Select
                  value={editor.categoryType}
                  onValueChange={(v: CategoryType) =>
                    setEditor((s) => ({ ...s, categoryType: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GOV">GOV</SelectItem>
                    <SelectItem value="PRIVATE">PRIVATE</SelectItem>
                    <SelectItem value="SCHEME">SCHEME</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {editor.kind.kind === "policyType" ? (
              <div className="space-y-1">
                <Label>Chart Mode</Label>
                <Select
                  value={editor.chartMode}
                  onValueChange={(v: "SINGLE" | "COMBINED") =>
                    setEditor((s) => ({ ...s, chartMode: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE">SINGLE</SelectItem>
                    <SelectItem value="COMBINED">COMBINED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {editor.kind.kind === "dropdown" ? (
              <>
                <div className="space-y-1">
                  <Label>Sort</Label>
                  <Input
                    value={editor.sortOrder}
                    onChange={(e) =>
                      setEditor((s) => ({ ...s, sortOrder: e.target.value }))
                    }
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editor.isActive}
                    onCheckedChange={(v) => setEditor((s) => ({ ...s, isActive: v }))}
                  />
                  <Label className="m-0">Active</Label>
                </div>
              </>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEditor} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitEditor()}
              disabled={busy || !editor.label.trim() || !editor.value.trim()}
            >
              {editor.mode === "create" ? "Add" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
