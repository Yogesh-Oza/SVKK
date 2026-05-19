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
import { apiGet, apiPatch, apiPost } from "@/lib/api/svkk-client";
import {
  pickExclusiveScope,
  policyScopeValidationMessage,
  POLICY_SCOPE_KEYS,
  resolvePermissionClosure,
} from "@/lib/rbac/permission-closure";
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
};

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const json = await apiGet<{ groups: PermissionGroup[] }>("/rbac/permissions");
      setGroups(json.groups ?? []);
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
    setSearch("");
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

  const toggle = (key: string, checked: boolean) => {
    setSelected((prev) => {
      if (POLICY_SCOPE_KEYS.includes(key as (typeof POLICY_SCOPE_KEYS)[number])) {
        return pickExclusiveScope(key, checked, prev, POLICY_SCOPE_KEYS);
      }
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleGroup = (keys: string[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (checked) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

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
    const scopeError = policyScopeValidationMessage(resolved);
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
        } = {
          permissionKeys,
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
        await apiPost(`/rbac/roles/${cloneFrom.id}/clone`, { name: name.trim() });
        toast.success("Role cloned");
      } else {
        await apiPost("/rbac/roles", {
          name: name.trim(),
          description: description.trim() || undefined,
          permissionKeys,
        });
        toast.success("Role created");
      }
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit role" : cloneFrom ? "Clone role" : "Create role"}
          </DialogTitle>
          <DialogDescription>
            Assign permissions for this role. Dependencies are enforced on the server.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
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
          <Input
            placeholder="Search permissions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border p-3">
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading permissions…</p>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((g) => {
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
                        className="h-7 text-xs"
                        onClick={() => toggleGroup(keys, !allOn)}
                      >
                        {allOn ? "Clear group" : "Select group"}
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {g.permissions.map((p) => (
                        <label
                          key={p.id}
                          className="flex cursor-pointer items-start gap-2 text-sm"
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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


