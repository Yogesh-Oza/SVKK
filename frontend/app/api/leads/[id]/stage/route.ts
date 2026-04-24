import { db } from "@/db";
import { FOLLOW_UPS, LEAD_STAGE_HISTORY, LEADS } from "@/db/collections";
import type {
  FollowUpDoc,
  LeadDoc,
  LeadStageHistoryDoc,
} from "@/db/collections";
import { canAccessLead, getSessionWithRole, requireAuth } from "@/lib/rbac";
import {
  isValidStageTransition,
  type LeadStage,
} from "@/features/leads/types/lead.types";
import { addDays, startOfDay } from "date-fns";
import { generateRandomUUID } from "@/helpers/generate-random-uuid";
import { NextRequest, NextResponse } from "next/server";

const VALID_STAGES: LeadStage[] = [
  "new",
  "contacted",
  "interested",
  "done",
  "lost",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionWithRole();
  requireAuth(session);

  const { id } = await params;

  const lead = await db.collection<LeadDoc>(LEADS).findOne({ id });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (!canAccessLead(session, lead)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const toStage = data.toStage;

  if (
    typeof toStage !== "string" ||
    !VALID_STAGES.includes(toStage as LeadStage)
  ) {
    return NextResponse.json({ error: "Invalid toStage" }, { status: 400 });
  }

  const currentStage = lead.stage as LeadStage;
  const targetStage = toStage as LeadStage;

  if (!isValidStageTransition(currentStage, targetStage)) {
    return NextResponse.json(
      { error: "Invalid stage transition - cannot skip stages" },
      { status: 400 },
    );
  }

  if (currentStage === targetStage) {
    return NextResponse.json(lead);
  }

  const now = new Date();
  await db.collection<LeadStageHistoryDoc>(LEAD_STAGE_HISTORY).insertOne({
    id: generateRandomUUID(),
    leadId: id,
    fromStage: currentStage,
    toStage: targetStage,
    changedByUserId: session.user.id,
    changedAt: now,
  });

  await db
    .collection(LEADS)
    .updateOne({ id }, { $set: { stage: targetStage, updatedAt: now } });
  const updated = { ...lead, stage: targetStage, updatedAt: now };

  if (targetStage === "interested" && lead.assignedUserId) {
    const existingCount = await db
      .collection(FOLLOW_UPS)
      .countDocuments({ leadId: id });
    if (existingCount === 0) {
      const baseDate = startOfDay(new Date());
      const scheduleDays = [1, 2, 3, 5, 7];
      const followUpDocs: FollowUpDoc[] = scheduleDays.map((days) => ({
        id: generateRandomUUID(),
        leadId: id,
        assignedUserId: lead.assignedUserId!,
        scheduledAt: addDays(baseDate, days),
        status: "pending",
        createdAt: now,
      }));
      await db.collection(FOLLOW_UPS).insertMany(followUpDocs);
    }
  }

  return NextResponse.json(updated);
}
