"use client";

import { DataTable } from "@/features/users/components/user-data-table";
import { UserStateCards } from "@/features/users/components/user-state-cards";
import type { User } from "@/features/users/utils/schema";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { apiGet } from "@/lib/api/svkk-client";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { getSvkkErrorMessage } from "@/features/users/utils/api-error";
import { useCallback, useEffect, useState } from "react";

export default function SvkkUsersPage() {
  const { user } = useSvkkAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const missingUrl = !getSvkkApiBase();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiGet<{ users: Record<string, unknown>[] }>("/users");
      const userList = (json.users ?? []).map((u) => ({
        id: String(u.id),
        name: String(u.name),
        email: String(u.email),
        image: (u.image as string | null | undefined) ?? null,
        role: u.role as User["role"],
        createdAt: new Date(String(u.createdAt ?? "")),
      }));
      setUsers(userList);
    } catch (e) {
      setError(getSvkkErrorMessage(e, "Failed to load users"));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (missingUrl || user?.role !== "SUPER_ADMIN") {
      return;
    }
    void fetchUsers();
  }, [missingUrl, user, fetchUsers]);

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  if (user?.role !== "SUPER_ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <h2 className="text-xl font-semibold">Access denied</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          You need super admin permissions to manage users.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm">Manage users and permissions</p>
      </div>

      <UserStateCards users={users} />

      {loading ? (
        <div className="text-muted-foreground rounded-md border p-8 text-center text-sm">
          Loading users…
        </div>
      ) : error ? (
        <div className="border-destructive/50 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          {error}
        </div>
      ) : (
        <DataTable users={users} onSuccess={fetchUsers} />
      )}
    </div>
  );
}
