"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { svkkJson } from "@/lib/svkk/api";
import { resolveNotificationNavigation } from "@/lib/svkk/notification-navigation";
import { hasPermission } from "@/lib/svkk/permissions";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { Bell, CheckCheck, ChevronLeft, ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl: string | null;
  policyId: string | null;
  emailSent: boolean;
  isRead: boolean;
  createdAt: string;
};

const PAGE_SIZE = 10;

export default function SvkkNotificationsPage() {
  const { user } = useSvkkAuth();
  const router = useRouter();
  const canSee = user ? hasPermission(user.permissions, "notifications:read") : false;
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async (pageNum: number) => {
    const qs = new URLSearchParams({
      limit: String(PAGE_SIZE),
      page: String(pageNum),
    });
    const data = await svkkJson<{
      notifications: NotificationItem[];
      unreadCount: number;
      totalCount: number;
      page: number;
      pageSize: number;
      totalPages: number;
    }>(`/notifications?${qs.toString()}`);
    setItems(data.notifications ?? []);
    setUnreadCount(data.unreadCount ?? 0);
    setTotalCount(data.totalCount ?? 0);
    setPage(data.page ?? pageNum);
    setTotalPages(data.totalPages ?? 1);
  }, []);

  const load = useCallback(
    async (pageNum: number) => {
      if (!canSee) return;
      setLoading(true);
      try {
        await fetchPage(pageNum);
      } catch {
        setItems([]);
        setUnreadCount(0);
        setTotalCount(0);
        setPage(1);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    [canSee, fetchPage],
  );

  useEffect(() => {
    void load(page);
  }, [page, load]);

  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

  async function markRead(id: string) {
    await svkkJson(`/notifications/${id}/read`, { method: "POST" });
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await svkkJson("/notifications/read-all", { method: "POST" });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  async function deleteAll() {
    if (!window.confirm(`Delete all ${totalCount} notifications? This cannot be undone.`)) {
      return;
    }
    await svkkJson("/notifications/delete-all", { method: "POST" });
    setItems([]);
    setUnreadCount(0);
    setTotalCount(0);
    setPage(1);
    setTotalPages(1);
  }

  function openNotification(n: NotificationItem) {
    void markRead(n.id);
    const nav = resolveNotificationNavigation({ linkUrl: n.linkUrl, policyId: n.policyId });
    if (!nav) return;
    if (nav.kind === "external") {
      window.open(nav.url, "_blank", "noopener,noreferrer");
    } else {
      router.push(nav.path);
    }
  }

  if (!canSee) {
    return <p className="text-muted-foreground text-sm">You do not have access to notifications.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Policy creation, policy number and document updates, and renewal reminders. Emails use
            templates from Email templates (admin).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unreadCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => void markAllRead()}
            >
              <CheckCheck className="mr-2 size-4" />
              Mark all read ({unreadCount})
            </Button>
          ) : null}
          {totalCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => void deleteAll()}
            >
              <Trash2 className="mr-2 size-4" />
              Delete all
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-5" />
            All notifications
          </CardTitle>
          <CardDescription>
            Click a row to open the policy in SVKK or an external document link.
            {!loading && totalCount > 0 ? (
              <span className="ml-1">
                Showing {rangeStart}–{rangeEnd} of {totalCount}
                {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
              </span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">No notifications yet.</p>
          ) : (
            <>
              <ul className="divide-y">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="hover:bg-muted/50 flex w-full gap-3 rounded-lg px-2 py-3 text-left transition-colors cursor-pointer"
                      onClick={() => openNotification(n)}
                    >
                      {!n.isRead ? (
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      ) : (
                        <span className="mt-2 h-2 w-2 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{n.title}</p>
                        <p className="text-muted-foreground text-sm">{n.body}</p>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {new Date(n.createdAt).toLocaleString("en-IN")}
                          {n.emailSent ? " · Email sent" : ""}
                        </p>
                      </div>
                      {(n.policyId || n.linkUrl) && (
                        <ExternalLink className="text-muted-foreground mt-1 size-4 shrink-0" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {totalPages > 1 ? (
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="mr-1 size-4" />
                    Previous
                  </Button>
                  <span className="text-muted-foreground px-2 text-sm">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                    <ChevronRight className="ml-1 size-4" />
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {hasPermission(user?.permissions ?? [], "admin:settings") ? (
        <p className="text-muted-foreground text-sm">
          <Link href="/email-templates" className="text-primary hover:underline">
            Edit email templates
          </Link>{" "}
          for policy and renewal messages.
        </p>
      ) : null}
    </div>
  );
}
