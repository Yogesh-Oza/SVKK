"use client";

import { RoleFormDialog, type RbacRoleRow } from "@/features/rbac/components/role-form-dialog";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { apiDelete, apiGet, apiPatch } from "@/lib/api/svkk-client";
import { canManageRoles } from "@/lib/svkk/permissions";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export default function RolesPage() {
  const { user, permissionsHydrated } = useSvkkAuth();
  const [roles, setRoles] = useState<RbacRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RbacRoleRow | null>(null);
  const [cloning, setCloning] = useState<RbacRoleRow | null>(null);

  const canManage = user?.permissions ? canManageRoles(user.permissions) : false;

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const json = await apiGet<{ roles: RbacRoleRow[] }>("/rbac/roles");
      setRoles(json.roles ?? []);
    } catch {
      toast.error("Failed to load roles");
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getSvkkApiBase() || !canManage || !permissionsHydrated) return;
    void fetchRoles();
  }, [canManage, permissionsHydrated, fetchRoles]);

  const handleToggleActive = async (role: RbacRoleRow) => {
    try {
      await apiPatch(`/rbac/roles/${role.id}`, { isActive: !role.isActive });
      toast.success(role.isActive ? "Role disabled" : "Role enabled");
      void fetchRoles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const handleDelete = async (role: RbacRoleRow) => {
    if (role.isSystem) return;
    if (!confirm(`Delete role "${role.name}"?`)) return;
    try {
      await apiDelete(`/rbac/roles/${role.id}`);
      toast.success("Role deleted");
      void fetchRoles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (!getSvkkApiBase()) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  if (!permissionsHydrated) {
    return (
      <div className="text-muted-foreground flex min-h-[30vh] items-center justify-center text-sm">
        Loading…
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <h2 className="text-xl font-semibold">Access denied</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          You need roles:manage permission to manage roles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles & permissions</h1>
          <p className="text-muted-foreground text-sm">
            Create custom roles and assign permissions
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setCloning(null);
            setDialogOpen(true);
          }}
        >
          Create role
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading roles…</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    <div>
                      {role.name}
                      {(role.villageOptionIds?.length ?? 0) > 0 ||
                      (role.areaOptionIds?.length ?? 0) > 0 ? (
                        <p className="text-muted-foreground text-xs font-normal">
                          {role.villageOptionIds?.length ?? 0} villages ·{" "}
                          {role.areaOptionIds?.length ?? 0} areas
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{role.slug}</TableCell>
                  <TableCell>{(role as RbacRoleRow & { userCount?: number }).userCount ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={role.isActive ? "default" : "secondary"}>
                      {role.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(role);
                        setCloning(null);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCloning(role);
                        setEditing(null);
                        setDialogOpen(true);
                      }}
                    >
                      Clone
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleToggleActive(role)}
                      disabled={role.isSystem}
                    >
                      {role.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleDelete(role)}
                      disabled={role.isSystem}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RoleFormDialog
        role={editing}
        cloneFrom={cloning}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => void fetchRoles()}
      />
    </div>
  );
}

