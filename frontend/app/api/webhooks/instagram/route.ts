import { db } from "@/db";
import {
  CHAT_CONVERSATIONS,
  CHAT_MESSAGES,
  INSTAGRAM_WEBHOOK_LOGS,
  USER,
} from "@/db/collections";
import type {
  ChatConversationDoc,
  ChatMessageDoc,
  InstagramWebhookLogDoc,
} from "@/db/collections";
import { regenerateLeadSummary } from "@/lib/ai/lead-summary";
import { createNotification } from "@/lib/notifications/create-notification";
import { resolveLeadFromInboundMessage } from "@/lib/lead-resolver";
import { generateRandomUUID } from "@/helpers/generate-random-uuid";
import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN;
  if (
    mode === "subscribe" &&
    verifyToken &&
    token === verifyToken &&
    challenge
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function verifyInstagramSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature.startsWith("sha256=")) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8"),
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (appSecret) {
    const signature = req.headers.get("x-hub-signature-256");
    if (
      !signature ||
      !verifyInstagramSignature(rawBody, signature, appSecret)
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    process.env.INSTAGRAM_WEBHOOK_LOGS_ENABLED === "true" ||
    process.env.INSTAGRAM_WEBHOOK_LOGS_ENABLED === "1"
  ) {
    const webhookLogCol = db.collection<InstagramWebhookLogDoc>(
      INSTAGRAM_WEBHOOK_LOGS,
    );
    const logDoc: InstagramWebhookLogDoc = {
      id: generateRandomUUID(),
      receivedAt: new Date(),
      payload: body,
    };
    void webhookLogCol.insertOne(logDoc).catch(() => {});
  }

  const raw = Array.isArray(body) ? body[0] : body;
  const data = raw as {
    object?: string;
    entry?: unknown[];
    field?: string;
    value?: {
      sender?: { id: string };
      message?: { mid: string; text?: string };
    };
  };

  type MessageEvent = {
    sender: { id: string; username?: string };
    message: { mid: string; text?: string };
  };

  const messageEvents: MessageEvent[] = [];

  if (
    data.field === "messages" &&
    data.value?.sender?.id &&
    data.value?.message
  ) {
    messageEvents.push({
      sender: data.value.sender as { id: string; username?: string },
      message: data.value.message,
    });
  } else if (data.object === "instagram" && Array.isArray(data.entry)) {
    for (const entry of data.entry as Array<{
      messaging?: MessageEvent[];
      changes?: Array<{ field?: string; value?: MessageEvent }>;
    }>) {
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (
            change.field === "messages" &&
            change.value?.sender?.id &&
            change.value?.message
          ) {
            messageEvents.push(change.value);
          }
        }
      } else if (Array.isArray(entry.messaging)) {
        for (const event of entry.messaging) {
          if (event.sender?.id && event.message) messageEvents.push(event);
        }
      }
    }
  }

  if (messageEvents.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const convCol = db.collection<ChatConversationDoc>(CHAT_CONVERSATIONS);
  const msgCol = db.collection<ChatMessageDoc>(CHAT_MESSAGES);

  for (const event of messageEvents) {
    const sender = event.sender;
    const message = event.message;
    const text = typeof message.text === "string" ? message.text : "";
    if (!sender?.id || !text) continue;

    const instagramUserId = sender.id;
    const instagramUsername = sender.username ?? undefined;
    const content = text;
    const externalMessageId =
      message.mid ?? `ig-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const lead = await resolveLeadFromInboundMessage({
      instagramUserId,
      instagramUsername,
      source: "instagram",
    });

    let conversation: ChatConversationDoc | null = (await convCol.findOne({
      leadId: lead.id,
    })) as ChatConversationDoc | null;
    if (!conversation) {
      const created: ChatConversationDoc = {
        id: generateRandomUUID(),
        leadId: lead.id,
        createdAt: new Date(),
      };
      await convCol.insertOne(created);
      conversation = created;
    }

    const existing = await msgCol.findOne({
      conversationId: conversation.id,
      externalMessageId,
    });
    if (existing) continue;

    const messageRow: ChatMessageDoc = {
      id: generateRandomUUID(),
      conversationId: conversation.id,
      senderId: null,
      senderRole: "client",
      content,
      createdAt: new Date(),
      channel: "instagram",
      direction: "inbound",
      externalMessageId,
    };
    await msgCol.insertOne(messageRow);

    const wsUrl = process.env.WS_BROADCAST_URL || "http://localhost:3001";
    void fetch(`${wsUrl}/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        message: {
          id: messageRow.id,
          content: messageRow.content,
          createdAt: messageRow.createdAt,
          senderId: messageRow.senderId,
          senderRole: messageRow.senderRole,
          channel: messageRow.channel,
          direction: messageRow.direction,
        },
      }),
    }).catch(() => {});

    const targetUserIds: string[] = [];
    if (lead.assignedUserId && typeof lead.assignedUserId === "string") {
      targetUserIds.push(lead.assignedUserId);
    } else {
      const admins = await db
        .collection(USER)
        .find({ role: "admin" })
        .toArray();
      for (const a of admins) {
        const id = (a as { id?: string }).id;
        if (id) targetUserIds.push(id);
      }
    }
    if (targetUserIds.length > 0) {
      await createNotification({
        type: "new_inbound",
        title: "New Client Message",
        body: `${lead.name} (Instagram)`,
        leadId: lead.id,
        targetUserIds,
      });
    }

    void regenerateLeadSummary(lead.id).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
