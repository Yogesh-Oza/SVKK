"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getNextValidStages,
  type LeadStage,
} from "@/features/leads/types/lead.types";
import { cn } from "@/lib/utils";
import { LeadInsightsPanel } from "@/features/ai/lead-insights-panel";
import { LeadScoreBadge } from "@/features/ai/lead-score-badge";
import { LeadSummaryCard } from "@/features/ai/lead-summary-card";
import { LeadChatPanel } from "@/features/chat/lead-chat-panel";
import { LeadFollowUps } from "@/features/follow-ups/components/lead-follow-ups";
import { ReassignLeadDialog } from "@/features/leads/components/reassign-lead-dialog";
import { format } from "date-fns";
import { ArrowLeft, Loader2, RefreshCw, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

interface LeadDetail {
  id: string;
  name: string;
  phone: string;
  source: string;
  stage: LeadStage;
  assignedUserId: string | null;
  createdAt: string;
  updatedAt: string;
  firstResponseAt?: string | null;
  slaStatus?: "pending" | "met" | "breached";
  slaBreachedAt?: string | null;
  aiSummary?: string | null;
  aiSummaryUpdatedAt?: string | Date | null;
  aiScore?: "hot" | "warm" | "cold" | null;
  aiScoreReason?: string | null;
  aiScoreUpdatedAt?: string | Date | null;
  stageHistory: Array<{
    id: string;
    fromStage: LeadStage;
    toStage: LeadStage;
    changedByUserId: string;
    changedAt: string;
  }>;
  assignedUser: { id: string; name: string; email: string } | null;
  whatsappPhone?: string | null;
  instagramUserId?: string | null;
}

const STAGE_COLORS: Record<LeadStage, string> = {
  new: "bg-slate-500",
  contacted: "bg-blue-500",
  interested: "bg-amber-500",
  done: "bg-green-500",
  lost: "bg-red-500",
};

export default function LeadDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [stageUpdating, setStageUpdating] = useState(false);
  const [scoreRefreshing, setScoreRefreshing] = useState(false);

  const fetchLead = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${id}`);
      const json = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          toast.error("Lead not found");
        } else if (res.status === 403) {
          toast.error("You do not have access to this lead");
        }
        setLead(null);
        return;
      }

      setLead(json);
    } catch {
      setLead(null);
      toast.error("Failed to load lead");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => setIsAdmin(data.role === "admin"))
      .catch(() => setIsAdmin(false));
  }, []);

  const handleStageChange = async (toStage: LeadStage) => {
    if (!lead || toStage === lead.stage) return;

    setStageUpdating(true);
    try {
      const res = await fetch(`/api/leads/${id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStage }),
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error ?? "Failed to update stage");
        return;
      }

      toast.success("Stage updated");
      setLead((prev) => (prev ? { ...prev, stage: toStage } : null));
      fetchLead();
    } catch {
      toast.error("Failed to update stage");
    } finally {
      setStageUpdating(false);
    }
  };

  const handleReassignSuccess = () => {
    setReassignOpen(false);
    fetchLead();
  };

  const handleRefreshScore = async () => {
    setScoreRefreshing(true);
    try {
      const res = await fetch("/api/ai/lead-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: id }),
      });
      const data = await res.json();
      if (res.ok && data.score) {
        setLead((prev) =>
          prev
            ? {
                ...prev,
                aiScore: data.score,
                aiScoreReason: data.reason ?? null,
              }
            : null
        );
        toast.success("Score updated");
      } else {
        toast.error("Failed to refresh score");
      }
    } catch {
      toast.error("Failed to refresh score");
    } finally {
      setScoreRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="px-4 py-4 lg:px-6">
        <Link
          href="/leads"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to leads
        </Link>
        <div className="mt-8 text-center text-muted-foreground">
          Lead not found or you do not have access.
        </div>
      </div>
    );
  }

  const nextStages = getNextValidStages(lead.stage);

  return (
    <div className="min-w-0 px-4 py-4 lg:px-6 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/leads"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to leads
        </Link>
      </div>

      <div className="flex flex-row gap-6">
        <div className="min-w-0 flex-1 space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>{lead.name}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {lead.aiScore && (
                  <LeadScoreBadge
                    score={lead.aiScore}
                    reason={lead.aiScoreReason ?? null}
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 cursor-pointer"
                  onClick={handleRefreshScore}
                  disabled={scoreRefreshing}
                >
                  {scoreRefreshing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  <span className="sr-only">Refresh AI score</span>
                </Button>
                <Badge
                  className={`${STAGE_COLORS[lead.stage]} text-white border-0 capitalize`}
                >
                  {lead.stage}
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Phone</p>
              <p className="font-medium">{lead.phone}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Source</p>
              <p className="font-medium capitalize">{lead.source}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Assigned To</p>
              <p className="font-medium">
                {lead.assignedUser
                  ? `${lead.assignedUser.name} (${lead.assignedUser.email})`
                  : "Unassigned"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-medium">
                {format(new Date(lead.createdAt), "MMM d, yyyy HH:mm")}
              </p>
            </div>
            {lead.firstResponseAt && (
              <div>
                <p className="text-sm text-muted-foreground">First Response</p>
                <p className="font-medium">
                  {format(new Date(lead.firstResponseAt), "MMM d, yyyy HH:mm")}
                </p>
              </div>
            )}
            {lead.slaStatus && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">SLA Status</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      className={cn(
                        "capitalize border-0",
                        lead.slaStatus === "met" && "bg-green-500 text-white",
                        lead.slaStatus === "pending" && "bg-yellow-500 text-white",
                        lead.slaStatus === "breached" && "bg-red-500 text-white"
                      )}
                    >
                      {lead.slaStatus}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {lead.slaStatus === "met" && "First response within 10 min"}
                    {lead.slaStatus === "pending" && "Awaiting first response (10 min SLA)"}
                    {lead.slaStatus === "breached" && "First response breached (10 min SLA)"}
                  </TooltipContent>
                </Tooltip>
              </div>
            )}

            {nextStages.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Change Stage
                </p>
                <Select
                  value=""
                  onValueChange={(v) => handleStageChange(v as LeadStage)}
                  disabled={stageUpdating}
                >
                  <SelectTrigger className="w-[200px] cursor-pointer">
                    <SelectValue placeholder="Select next stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {nextStages.map((s) => (
                      <SelectItem
                        key={s}
                        value={s}
                        className="cursor-pointer capitalize"
                      >
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => setReassignOpen(true)}
                className="cursor-pointer"
              >
                <UserPlus className="size-4 mr-2" />
                Reassign Lead
              </Button>
            )}
          </CardContent>
        </Card>

        <LeadSummaryCard
          leadId={id}
          aiSummary={lead.aiSummary ?? null}
          aiSummaryUpdatedAt={lead.aiSummaryUpdatedAt ?? null}
          onRefresh={fetchLead}
          canAccess
        />

        <Card>
          <CardHeader>
            <CardTitle>Stage History</CardTitle>
          </CardHeader>
          <CardContent>
            {lead.stageHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No stage changes yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {lead.stageHistory.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between text-sm border-b pb-2 last:border-0"
                  >
                    <span className="capitalize">
                      {h.fromStage} → {h.toStage}
                    </span>
                    <span className="text-muted-foreground">
                      {format(new Date(h.changedAt), "MMM d, h:mm a")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <LeadFollowUps leadId={id} />

        <LeadInsightsPanel leadId={id} isAdmin={isAdmin} />
        </div>

        <div className="sticky top-4 min-w-[320px] flex-1 self-start">
          <LeadChatPanel
            leadId={id}
            leadName={lead.name}
            canReply={true}
            whatsappPhone={lead.whatsappPhone ?? null}
            instagramUserId={lead.instagramUserId ?? null}
          />
        </div>

      </div>

      <ReassignLeadDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        leadId={id}
        onSuccess={handleReassignSuccess}
      />
    </div>
  );
}
