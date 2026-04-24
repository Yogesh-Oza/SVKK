import { db } from "@/db";
import { LEADS, TATTOO_TYPES, USER } from "@/db/collections";
import type { LeadDoc, LeadSource, UserDoc } from "@/db/collections";
import { getSessionWithRole, requireAuth } from "@/lib/rbac";
import {
  LEAD_SOURCES,
  type LeadSource as LeadSourceType,
} from "@/features/leads/types/lead.types";
import { generateRandomUUID } from "@/helpers/generate-random-uuid";
import { NextRequest, NextResponse } from "next/server";

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

const createLeadSchema = {
  name: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  phone: (v: unknown) => {
    if (typeof v !== "string") return false;
    const s = v.replace(/\s/g, "").trim();
    return s.length > 0 && E164_REGEX.test(s);
  },
  source: (v: unknown) =>
    typeof v === "string" && LEAD_SOURCES.includes(v as LeadSourceType),
};

export async function GET(req: NextRequest) {
  const session = await getSessionWithRole();
  requireAuth(session);

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    50,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)),
  );
  const stage = searchParams.get("stage");
  const assignedUserId = searchParams.get("assignedUserId");
  const search = searchParams.get("search")?.trim();

  const offset = (page - 1) * limit;
  const filter: Record<string, unknown> = {};

  if (session.role === "sales") {
    filter.assignedUserId = session.user.id;
  }
  if (stage) {
    filter.stage = stage;
  }
  if (assignedUserId && session.role === "admin") {
    filter.assignedUserId = assignedUserId;
  }
  if (search && search.length > 0) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  const leadsCol = db.collection<LeadDoc>(LEADS);
  const [leadsResult, total] = await Promise.all([
    leadsCol
      .find(filter)
      .sort({ createdAt: 1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
    leadsCol.countDocuments(filter),
  ]);

  const userIds = [
    ...new Set(
      leadsResult
        .map((l) => l.assignedUserId)
        .filter((id): id is string => id != null),
    ),
  ];
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await db
      .collection<UserDoc>(USER)
      .find({ id: { $in: userIds } })
      .project({ id: 1, name: 1 })
      .toArray();
    for (const u of users) {
      userMap.set(u.id, u.name);
    }
  }

  return NextResponse.json({
    leads: leadsResult.map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      source: l.source,
      stage: l.stage,
      assignedUserId: l.assignedUserId ?? null,
      assignedUserName: l.assignedUserId
        ? (userMap.get(l.assignedUserId) ?? null)
        : null,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      slaStatus: l.slaStatus,
      firstResponseAt: l.firstResponseAt ?? null,
      aiScore: l.aiScore ?? null,
      aiScoreReason: l.aiScoreReason ?? null,
    })),
    total,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithRole();
  requireAuth(session);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const name = data.name;
  const phone = data.phone;
  const source = data.source ?? "manual";
  const assignedUserId = data.assignedUserId as string | undefined;
  const tattooTypeId = data.tattooTypeId as string | undefined;

  if (!createLeadSchema.name(name)) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!createLeadSchema.phone(phone)) {
    return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  }
  if (!createLeadSchema.source(source)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const phoneStr = String(phone).replace(/\s/g, "").trim();
  const leadsCol = db.collection<LeadDoc>(LEADS);

  const existing = await leadsCol.findOne({ phone: phoneStr });
  if (existing) {
    return NextResponse.json(
      { error: "Phone number already exists" },
      { status: 409 },
    );
  }

  let finalAssignedUserId: string | null;
  if (session.role === "admin" && assignedUserId) {
    finalAssignedUserId = assignedUserId;
  } else {
    finalAssignedUserId = session.user.id;
  }

  let finalTattooTypeId: string | null = null;
  if (tattooTypeId) {
    const exists = await db
      .collection(TATTOO_TYPES)
      .findOne({ id: tattooTypeId });
    if (exists) finalTattooTypeId = tattooTypeId;
  }

  const now = new Date();
  const created: LeadDoc = {
    id: generateRandomUUID(),
    name: String(name).trim(),
    phone: phoneStr,
    source: source as LeadSource,
    stage: "new",
    assignedUserId: finalAssignedUserId,
    createdAt: now,
    updatedAt: now,
    slaStatus: "pending",
    tattooTypeId: finalTattooTypeId,
  };
  await leadsCol.insertOne(created);

  return NextResponse.json(created);
}
