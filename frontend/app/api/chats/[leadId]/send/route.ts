import { db } from "@/db";
import {
  CHAT_CONVERSATIONS,
  CHAT_MESSAGES,
  CHAT_UPLOADS,
  LEAD_STAGE_HISTORY,
  LEADS,
} from "@/db/collections";
import type {
  ChatConversationDoc,
  ChatMessageDoc,
  ChatUploadDoc,
  LeadDoc,
} from "@/db/collections";
import type { ChatAttachmentType } from "@/db/collections";
import { canAccessLead, getSessionWithRole, requireAuth } from "@/lib/rbac";
import type { LeadStage } from "@/features/leads/types/lead.types";
import { sendInstagramMessage } from "@/lib/integrations/instagram";
import { sendWhatsAppMessage } from "@/lib/integrations/whatsapp";
import { generateRandomUUID } from "@/helpers/generate-random-uuid";
import { NextRequest, NextResponse } from "next/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function attachmentTypeFromMime(mime: string): ChatAttachmentType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const session = await getSessionWithRole();
  requireAuth(session);

  const { leadId } = await params;

  const lead = await db.collection<LeadDoc>(LEADS).findOne({ id: leadId });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (!canAccessLead(session, lead)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";
  let content: string;
  let channel: "app" | "whatsapp" | "instagram";
  let attachmentUrl: string | null = null;
  let attachmentType: ChatAttachmentType | null = null;

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }
    const contentVal = formData.get("content");
    content = typeof contentVal === "string" ? contentVal.trim() : "";
    const channelRaw = formData.get("channel");
    const ch =
      channelRaw === "whatsapp" || channelRaw === "instagram"
        ? channelRaw
        : "app";
    channel = ch;

    const file = formData.get("file");
    if (file && file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File too large (max 10MB)" },
          { status: 400 },
        );
      }
      const uploadId = generateRandomUUID();
      const buffer = Buffer.from(await file.arrayBuffer());
      const uploadDoc: ChatUploadDoc = {
        id: uploadId,
        contentType: file.type,
        data: buffer,
        filename: file.name || null,
        createdAt: new Date(),
      };
      await db.collection<ChatUploadDoc>(CHAT_UPLOADS).insertOne(uploadDoc);
      const origin =
        req.headers.get("x-forwarded-proto") &&
        req.headers.get("x-forwarded-host")
          ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("x-forwarded-host")}`
          : process.env.NEXTAUTH_URL || "http://localhost:3000";
      attachmentUrl = `${origin}/api/uploads/${uploadId}`;
      attachmentType = attachmentTypeFromMime(file.type);
    }
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const data = body as Record<string, unknown>;
    content = typeof data.content === "string" ? data.content.trim() : "";
    const channelRaw =
      (data.channel as "app" | "internal" | "whatsapp" | "instagram") ?? "app";
    channel = channelRaw === "internal" ? "app" : channelRaw;
  }

  if (!content && !attachmentUrl) {
    return NextResponse.json(
      { error: "Content or attachment required" },
      { status: 400 },
    );
  }
  const trimmedContent = content || "";

  if (channel === "whatsapp" && !lead.whatsappPhone) {
    return NextResponse.json(
      { error: "Lead has no WhatsApp phone configured" },
      { status: 400 },
    );
  }

  if (channel === "instagram" && !lead.instagramUserId) {
    return NextResponse.json(
      { error: "Lead has no Instagram user ID configured" },
      { status: 400 },
    );
  }

  let conversation: ChatConversationDoc | null = (await db
    .collection<ChatConversationDoc>(CHAT_CONVERSATIONS)
    .findOne({ leadId })) as ChatConversationDoc | null;

  if (!conversation) {
    const created: ChatConversationDoc = {
      id: generateRandomUUID(),
      leadId,
      createdAt: new Date(),
    };
    await db.collection(CHAT_CONVERSATIONS).insertOne(created);
    conversation = created;
  }

  const role = session.role === "admin" ? "admin" : "sales";
  let externalMessageId: string | null = null;

  if (channel === "whatsapp" && lead.whatsappPhone) {
    const result = await sendWhatsAppMessage({
      phone: lead.whatsappPhone,
      content: trimmedContent,
      ...(attachmentUrl &&
        attachmentType && {
          attachment: { type: attachmentType, url: attachmentUrl },
        }),
    });
    if (!result) {
      return NextResponse.json(
        { error: "Failed to send WhatsApp message" },
        { status: 502 },
      );
    }
    externalMessageId = result.externalMessageId;
  } else if (channel === "instagram" && lead.instagramUserId) {
    const result = await sendInstagramMessage({
      instagramUserId: lead.instagramUserId,
      content: trimmedContent,
      ...(attachmentUrl &&
        attachmentType && {
          attachment: { type: attachmentType, url: attachmentUrl },
        }),
    });
    if (!result) {
      return NextResponse.json(
        { error: "Failed to send Instagram message" },
        { status: 502 },
      );
    }
    externalMessageId = result.externalMessageId;
  }

  const now = new Date();
  const message: ChatMessageDoc = {
    id: generateRandomUUID(),
    conversationId: conversation.id,
    senderId: session.user.id,
    senderRole: role,
    content: trimmedContent,
    createdAt: now,
    channel,
    direction: channel === "app" ? null : "outbound",
    externalMessageId,
    ...(attachmentUrl && { attachmentUrl }),
    ...(attachmentType && { attachmentType }),
  };
  await db.collection(CHAT_MESSAGES).insertOne(message);

  if (lead.firstResponseAt == null) {
    await db.collection(LEADS).updateOne(
      { id: leadId },
      {
        $set: {
          firstResponseAt: now,
          slaStatus: "met",
          updatedAt: now,
        },
      },
    );
  }

  const currentStage = lead.stage as LeadStage;
  if (currentStage === "new") {
    await db.collection(LEAD_STAGE_HISTORY).insertOne({
      id: generateRandomUUID(),
      leadId,
      fromStage: "new",
      toStage: "contacted",
      changedByUserId: session.user.id,
      changedAt: now,
    });
    await db
      .collection(LEADS)
      .updateOne(
        { id: leadId },
        { $set: { stage: "contacted", updatedAt: now } },
      );
  }

  const wsUrl = process.env.WS_BROADCAST_URL || "http://localhost:3001";
  void fetch(`${wsUrl}/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId, message }),
  }).catch(() => {});

  return NextResponse.json(message);
}
