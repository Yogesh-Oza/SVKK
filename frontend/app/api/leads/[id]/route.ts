import { db } from "@/db";
import { LEAD_STAGE_HISTORY, LEADS, USER } from "@/db/collections";
import type { LeadDoc, LeadStageHistoryDoc, UserDoc } from "@/db/collections";
import { canAccessLead, getSessionWithRole, requireAuth } from "@/lib/rbac";
import {
  LEAD_SOURCES,
  type LeadSource,
} from "@/features/leads/types/lead.types";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
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

  const stageHistory = await db
    .collection<LeadStageHistoryDoc>(LEAD_STAGE_HISTORY)
    .find({ leadId: id })
    .sort({ changedAt: 1 })
    .toArray();

  let assignedUser: { id: string; name: string; email: string } | null = null;
  if (lead.assignedUserId) {
    const u = await db
      .collection<UserDoc>(USER)
      .findOne({ id: lead.assignedUserId });
    if (u) assignedUser = { id: u.id, name: u.name, email: u.email };
  }

  return NextResponse.json({
    ...lead,
    stageHistory,
    assignedUser,
  });
}

const patchSchema = {
  name: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  source: (v: unknown) =>
    typeof v === "string" && LEAD_SOURCES.includes(v as LeadSource),
};

export async function PATCH(
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
  const updates: { name?: string; source?: LeadSource; updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) {
    if (!patchSchema.name(data.name)) {
      return NextResponse.json(
        { error: "Name must be a non-empty string" },
        { status: 400 },
      );
    }
    updates.name = String(data.name).trim();
  }

  if (data.source !== undefined) {
    if (!patchSchema.source(data.source)) {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }
    updates.source = data.source as LeadSource;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json(lead);
  }

  await db.collection(LEADS).updateOne({ id }, { $set: updates });
  const updated = { ...lead, ...updates };
  return NextResponse.json(updated);
}
