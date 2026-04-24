"use client";

import { LeadScoreBadge } from "@/features/ai/lead-score-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import type { LeadStage } from "../utils/schema";
import { STAGE_COLORS } from "../utils/schema";
import type { LeadWithAssignee } from "./kanban-board";

interface KanbanCardProps {
  lead: LeadWithAssignee;
  assignedUserName: string | null;
  isDraggable: boolean;
}

export function KanbanCard({
  lead,
  assignedUserName,
  isDraggable,
}: KanbanCardProps) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lead.id,
    data: {
      type: "lead",
      lead,
    },
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const stageColor = STAGE_COLORS[lead.stage as LeadStage] ?? "bg-muted";

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-drag-handle]")) return;
    router.push(`/leads/${lead.id}`);
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-pointer py-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging && "opacity-50 shadow-lg",
        !isDraggable && "cursor-not-allowed opacity-90",
      )}
      onClick={handleCardClick}
    >
      <CardContent className="space-y-2 px-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="flex-1 text-sm font-medium leading-tight">
            {lead.name}
          </h4>
          {isDraggable && (
            <button
              {...attributes}
              {...listeners}
              data-drag-handle
              className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="size-4" />
            </button>
          )}
        </div>

        <p className="text-muted-foreground text-xs">{lead.phone}</p>

        <div className="flex items-center justify-between pt-1 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Badge
              variant="secondary"
              className={cn(stageColor, "text-white border-0 text-[10px] capitalize shrink-0")}
            >
              {lead.stage}
            </Badge>
            {lead.aiScore && (
              <LeadScoreBadge
                score={lead.aiScore}
                reason={lead.aiScoreReason ?? null}
              />
            )}
            {lead.slaStatus && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] border-0 shrink-0",
                      lead.slaStatus === "met" && "bg-green-500 text-white",
                      lead.slaStatus === "pending" && "bg-yellow-500 text-white",
                      lead.slaStatus === "breached" && "bg-red-500 text-white"
                    )}
                  >
                    SLA
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  {lead.slaStatus === "met" && "First response within 10 min"}
                  {lead.slaStatus === "pending" && "Awaiting first response (10 min SLA)"}
                  {lead.slaStatus === "breached" && "First response breached (10 min SLA)"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          {assignedUserName && (
            <span className="text-muted-foreground truncate text-xs max-w-[120px]">
              {assignedUserName}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
