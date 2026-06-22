"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiGet, apiPatch, apiPost } from "@/lib/api/svkk-client";
import {
  geoValidationMessageWithSelection,
  permissionValidationMessage,
  pickExclusiveScope,
  resolvePermissionClosure,
  roleRequiresGeo,
  scopeFamilyForKey,
} from "@/lib/rbac/permission-closure";
import type { AxiosError } from "axios";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type PermissionRow = {
  id: string;
  key: string;
  label: string;
  group: string;
  groupOrder: number;
  isScope: boolean;
};

type PermissionGroup = {
  group: string;
  groupOrder: number;
  permissions: PermissionRow[];
};

export type RbacRoleRow = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissionKeys: string[];
  villageOptionIds?: string[];
  areaOptionIds?: string[];
};

type GeoOption = { id: string; value: string; label: string };
type GeoOptionsResponse = { villages: GeoOption[]; areas: GeoOption[] };

interface RoleFormDialogProps {
  role?: RbacRoleRow | null;
  cloneFrom?: RbacRoleRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function RoleFormDialog({
  role,
  cloneFrom,
  open,
  onOpenChange,
  onSuccess,
}: RoleFormDialogProps) {
  const isEdit = !!role && !cloneFrom;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [geoVillageSearch, setGeoVillageSearch] = useState("");
  const [geoAreaSearch, setGeoAreaSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [geoOptions, setGeoOptions] = useState<GeoOptionsResponse>({ villages: [], areas: [] });
  const [villageOptionIds, setVillageOptionIds] = useState<string[]>([]);
  const [areaOptionIds, setAreaOptionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const [permJson, geoJson] = await Promise.all([
        apiGet<{ groups: PermissionGroup[] }>("/rbac/permissions"),
        apiGet<GeoOptionsResponse>("/rbac/geo-options"),
      ]);
      setGroups(permJson.groups ?? []);
      setGeoOptions(geoJson);
    } catch {
      toast.error("Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadPermissions();
    const source = role ?? cloneFrom;
    setName(cloneFrom ? `${cloneFrom.name} (copy)` : (source?.name ?? ""));
    setDescription(source?.description ?? "");
    setSelected(new Set(source?.permissionKeys ?? []));
    setVillageOptionIds(source?.villageOptionIds ?? []);
    setAreaOptionIds(source?.areaOptionIds ?? []);
    setSearch("");
    setGeoVillageSearch("");
    setGeoAreaSearch("");
  }, [open, role, cloneFrom, loadPermissions]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.key.toLowerCase().includes(q) ||
            g.group.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [groups, search]);

  const resolvedPermissions = useMemo(() => resolvePermissionClosure(selected), [selected]);

  const showGeo = useMemo(() => roleRequiresGeo(resolvedPermissions), [resolvedPermissions]);

  const isScopeGroup = useCallback(
    (g: PermissionGroup) =>
      g.permissions.length > 0 &&
      g.permissions.every((p) => p.isScope || scopeFamilyForKey(p.key) !== null),
    [],
  );

  const scopeGroups = useMemo(
    () => filteredGroups.filter(isScopeGroup),
    [filteredGroups, isScopeGroup],
  );
  const nonScopeGroups = useMemo(
    () => filteredGroups.filter((g) => !isScopeGroup(g)),
    [filteredGroups, isScopeGroup],
  );

  const validationMessage = useMemo(() => {
    const permMsg = permissionValidationMessage(resolvedPermissions);
    if (permMsg) return permMsg;
    return geoValidationMessageWithSelection(
      resolvedPermissions,
      villageOptionIds,
      areaOptionIds,
    );
  }, [resolvedPermissions, villageOptionIds, areaOptionIds]);

  const filteredVillages = useMemo(() => {
    const q = geoVillageSearch.trim().toLowerCase();
    if (!q) return geoOptions.villages;
    return geoOptions.villages.filter(
      (v) => v.label.toLowerCase().includes(q) || v.value.toLowerCase().includes(q),
    );
  }, [geoOptions.villages, geoVillageSearch]);

  const filteredAreas = useMemo(() => {
    const q = geoAreaSearch.trim().toLowerCase();
    if (!q) return geoOptions.areas;
    return geoOptions.areas.filter(
      (a) => a.label.toLowerCase().includes(q) || a.value.toLowerCase().includes(q),
    );
  }, [geoOptions.areas, geoAreaSearch]);

  const setAllGeo = (kind: "village" | "area", ids: string[], on: boolean) => {
    const setter = kind === "village" ? setVillageOptionIds : setAreaOptionIds;
    setter((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return [...next];
    });
  };

  const toggleGeoId = (kind: "village" | "area", id: string, checked: boolean) => {
    const setter = kind === "village" ? setVillageOptionIds : setAreaOptionIds;
    setter((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return [...next];
    });
  };

  const toggle = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const family = scopeFamilyForKey(key);
      if (family) {
        return pickExclusiveScope(key, checked, prev, family);
      }
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleGroup = (keys: string[], checked: boolean, isScopeGroup: boolean) => {
    if (isScopeGroup && checked) {
      toast.error("Pick only one scope option in this group — you cannot combine them.");
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (checked) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  function extractApiErrorMessage(e: unknown): string {
    const axiosErr = e as AxiosError<{ message?: string }>;
    const msg = axiosErr.response?.data?.message;
    if (typeof msg === "string" && msg.trim()) {
      return msg;
    }
    return e instanceof Error ? e.message : "Save failed";
  }

  const handleSave = async () => {
    if (name.trim().length < 2) {
      toast.error("Role name is required");
      return;
    }
    if (selected.size === 0) {
      toast.error("Select at least one permission");
      return;
    }
    const resolved = resolvePermissionClosure(selected);
    const scopeError =
      permissionValidationMessage(resolved) ??
      geoValidationMessageWithSelection(resolved, villageOptionIds, areaOptionIds);
    if (scopeError) {
      toast.error(scopeError);
      return;
    }
    setSaving(true);
    try {
      const permissionKeys = [...selected];
      if (isEdit && role) {
        const body: {
          name?: string;
          description?: string;
          permissionKeys: string[];
          villageOptionIds?: string[];
          areaOptionIds?: string[];
        } = {
          permissionKeys,
          villageOptionIds,
          areaOptionIds,
        };
        if (!(isEdit && role.isSystem)) {
          body.name = name.trim();
        }
        const desc = description.trim();
        if (desc) {
          body.description = desc;
        }
        await apiPatch(`/rbac/roles/${role.id}`, body);
        toast.success("Role updated");
      } else if (cloneFrom) {
        // Clone dialog allows editing permissions + geography; create a new role using the form state.
        await apiPost("/rbac/roles", {
          name: name.trim(),
          description: description.trim() || undefined,
          permissionKeys,
          villageOptionIds,
          areaOptionIds,
        });
        toast.success("Role created");
      } else {
        await apiPost("/rbac/roles", {
          name: name.trim(),
          description: description.trim() || undefined,
          permissionKeys,
          villageOptionIds,
          areaOptionIds,
        });
        toast.success("Role created");
      }
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      toast.error(extractApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const villageIdsVisible = filteredVillages.map((v) => v.id);
  const areaIdsVisible = filteredAreas.map((a) => a.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92vh,920px)] max-h-[92vh] w-[min(96vw,80rem)] max-w-[min(96vw,80rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,80rem)]">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle>
            {isEdit ? "Edit role" : cloneFrom ? "Clone role" : "Create role"}
          </DialogTitle>
          <DialogDescription className="text-left">
            <span className="block">
              Geography appears only when this role uses{" "}
              <strong className="font-medium">village scope</strong> (e.g.{" "}
              <code className="text-xs">policy:scope_village</code>,{" "}
              <code className="text-xs">claim:scope_village</code>,{" "}
              <code className="text-xs">future:scope_village</code>,{" "}
              <code className="text-xs">mis:policy:scope_village</code>, or{" "}
              <code className="text-xs">mis:claim:scope_village</code>
              ). All-scope roles do not need it.
            </span>
            <span className="mt-2 block">
              The village/area lists are the full master catalog: tick only what{" "}
              <strong className="font-medium">this role</strong> may access. Other roles are
              unchanged until you edit them.
            </span>
            <span className="mt-2 block">
              If both villages and areas are selected for a role, a record must match both. Scope
              groups (policy / MIS / claims) allow only one option each.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid shrink-0 gap-3 border-b px-6 py-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEdit && role?.isSystem}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role-desc">Description</Label>
            <Input
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {validationMessage ? (
            <p className="text-destructive col-span-full text-sm" role="alert">
              {validationMessage}
            </p>
          ) : null}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-6 py-4">
            <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
              {/* Left: permissions (excluding scope groups) */}
              <section className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold">Permissions</h3>
                  <Input
                    className="sm:max-w-xs"
                    placeholder="Search permissions…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="rounded-md border p-4">
                  {loading ? (
                    <p className="text-muted-foreground text-sm">Loading permissions…</p>
                  ) : (
                    <div className="space-y-5">
                      {nonScopeGroups.map((g) => {
                        const keys = g.permissions.map((p) => p.key);
                        const allOn = keys.every((k) => selected.has(k));
                        return (
                          <div key={g.group} className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">{g.group}</p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 shrink-0 text-xs"
                                onClick={() => toggleGroup(keys, !allOn, false)}
                              >
                                {allOn ? "Clear group" : "Select group"}
                              </Button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              {g.permissions.map((p) => (
                                <label
                                  key={p.id}
                                  className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent p-1.5 text-sm hover:bg-muted/50"
                                >
                                  <Checkbox
                                    checked={selected.has(p.key)}
                                    onCheckedChange={(c) => toggle(p.key, c === true)}
                                    disabled={isEdit && role?.isSystem && p.key === "*:*"}
                                  />
                                  <span>
                                    {p.label}
                                    <span className="text-muted-foreground block text-xs">
                                      {p.key}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              {/* Right: scopes + geography */}
              <aside className="space-y-4">
                <section className="rounded-md border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">Scope</h3>
                      <p className="text-muted-foreground text-xs">
                        Policy / Claims / MIS scope (select one per group)
                      </p>
                    </div>
                  </div>
                  {scopeGroups.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No scope groups found.</p>
                  ) : (
                    <div className="space-y-4">
                      {scopeGroups.map((g) => {
                        const keys = g.permissions.map((p) => p.key);
                        const anyOn = keys.some((k) => selected.has(k));
                        return (
                          <div key={g.group} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">{g.group}</p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => toggleGroup(keys, false, true)}
                              >
                                Clear
                              </Button>
                            </div>
                            <div className="space-y-2">
                              {g.permissions.map((p) => (
                                <label
                                  key={p.id}
                                  className="flex cursor-pointer items-start gap-2 rounded-md border border-transparent p-1.5 text-sm hover:bg-muted/50"
                                >
                                  <Checkbox
                                    checked={selected.has(p.key)}
                                    onCheckedChange={(c) => toggle(p.key, c === true)}
                                  />
                                  <span>
                                    {p.label}
                                    <span className="text-muted-foreground block text-xs">
                                      {p.key}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                            {!anyOn ? (
                              <p className="text-muted-foreground text-xs">
                                Pick one option in this scope group.
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {showGeo ? (
                  <section className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold">Geography access (this role only)</h3>
                      <p className="text-muted-foreground text-xs">
                        {villageOptionIds.length} villages · {areaOptionIds.length} areas selected — only
                        checked rows are stored for this role.
                      </p>
                    </div>
                    <div className="grid gap-4">
                      <GeoCheckboxPanel
                        title="Allowed villages"
                        search={geoVillageSearch}
                        onSearchChange={setGeoVillageSearch}
                        options={filteredVillages}
                        selectedIds={villageOptionIds}
                        onToggle={(id, checked) => toggleGeoId("village", id, checked)}
                        onSelectVisible={() => setAllGeo("village", villageIdsVisible, true)}
                        onClearVisible={() => setAllGeo("village", villageIdsVisible, false)}
                        onClearAll={() => setVillageOptionIds([])}
                      />
                      <GeoCheckboxPanel
                        title="Allowed areas"
                        search={geoAreaSearch}
                        onSearchChange={setGeoAreaSearch}
                        options={filteredAreas}
                        selectedIds={areaOptionIds}
                        onToggle={(id, checked) => toggleGeoId("area", id, checked)}
                        onSelectVisible={() => setAllGeo("area", areaIdsVisible, true)}
                        onClearVisible={() => setAllGeo("area", areaIdsVisible, false)}
                        onClearAll={() => setAreaOptionIds([])}
                      />
                    </div>
                  </section>
                ) : (
                  <p className="text-muted-foreground rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm">
                    No geography picker: enable{" "}
                    <strong className="font-medium text-foreground">Village-scoped</strong> under
                    Policy scope, Claim scope, Future scope, Policy MIS scope, or Claim MIS scope
                    to assign villages/areas for this role.
                  </p>
                )}
              </aside>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || Boolean(validationMessage)}
          >
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GeoCheckboxPanel({
  title,
  search,
  onSearchChange,
  options,
  selectedIds,
  onToggle,
  onSelectVisible,
  onClearVisible,
  onClearAll,
}: {
  title: string;
  search: string;
  onSearchChange: (v: string) => void;
  options: GeoOption[];
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
  onSelectVisible: () => void;
  onClearVisible: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="flex h-[min(38vh,300px)] flex-col rounded-md border">
      <div className="space-y-2 border-b p-3">
        <p className="text-sm font-medium">{title}</p>
        <Input
          placeholder={`Search ${title.toLowerCase()}…`}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8"
        />
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onSelectVisible}>
            Select shown
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onClearVisible}>
            Clear shown
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearAll}>
            Clear all
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-1 p-2 sm:grid-cols-2">
          {options.length === 0 ? (
            <p className="text-muted-foreground col-span-full px-2 py-4 text-sm">No matches</p>
          ) : (
            options.map((opt) => (
              <label
                key={opt.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  checked={selectedIds.includes(opt.id)}
                  onCheckedChange={(c) => onToggle(opt.id, c === true)}
                />
                <span className="truncate" title={opt.label}>
                  {opt.label}
                </span>
              </label>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}


