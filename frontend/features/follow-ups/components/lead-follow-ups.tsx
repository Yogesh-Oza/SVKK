"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Check, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface FollowUpWithLead {
  id: string;
  leadId: string;
  scheduledAt: string;
  completedAt: string | null;
  status: "pending" | "completed" | "missed";
  note: string | null;
}

interface LeadFollowUpsProps {
  leadId: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500",
  completed: "bg-green-500",
  missed: "bg-red-500",
};

export function LeadFollowUps({ leadId }: LeadFollowUpsProps) {
  const [followUps, setFollowUps] = useState<FollowUpWithLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/follow-ups?leadId=${leadId}`);
      const json = await res.json();

      if (!res.ok) {
        setFollowUps([]);
        return;
      }

      setFollowUps(json.followUps ?? []);
    } catch {
      setFollowUps([]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  const handleComplete = async (id: string) => {
    setCompletingId(id);
    try {
      const res = await fetch(`/api/follow-ups/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const json = await res.json();
        toast.error(json.error ?? "Failed to complete follow-up");
        return;
      }

      toast.success("Follow-up completed");
      fetchFollowUps();
    } catch {
      toast.error("Failed to complete follow-up");
    } finally {
      setCompletingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Follow-Ups</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Follow-Ups</CardTitle>
      </CardHeader>
      <CardContent>
        {followUps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No follow-ups scheduled.
          </p>
        ) : (
          <ul className="space-y-3">
            {followUps.map((fu) => (
              <li
                key={fu.id}
                className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {format(new Date(fu.scheduledAt), "MMM d, yyyy")}
                    </span>
                    <Badge
                      className={`${STATUS_COLORS[fu.status] ?? "bg-muted"} text-white border-0 capitalize text-xs`}
                    >
                      {fu.status}
                    </Badge>
                  </div>
                  {fu.note && (
                    <p className="mt-1 text-xs text-muted-foreground truncate">
                      {fu.note}
                    </p>
                  )}
                </div>
                {fu.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleComplete(fu.id)}
                    disabled={completingId === fu.id}
                    className="ml-2 shrink-0 cursor-pointer"
                  >
                    {completingId === fu.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="size-4 mr-1" />
                        Complete
                      </>
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
