import { db } from "@/db";
import {
  CHAT_CONVERSATIONS,
  CHAT_MESSAGES,
  USER,
  WHATSAPP_WEBHOOK_LOGS,
} from "@/db/collections";
import type {
  ChatConversationDoc,
  ChatMessageDoc,
  WhatsAppWebhookLogDoc,
} from "@/db/collections";
import { regenerateLeadSummary } from "@/lib/ai/lead-summary";
import { createNotification } from "@/lib/notifications/create-notification";
import { resolveLeadFromInboundMessage } from "@/lib/lead-resolver";
import { generateRandomUUID } from "@/helpers/generate-random-uuid";
import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `+${digits.slice(1)}` : `+${digits}`;
}

function verifyWhatsAppSignature(
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
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

export async function POST(req: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const signature = req.headers.get("x-hub-signature-256");
    if (!signature || !verifyWhatsAppSignature(rawBody, signature, appSecret)) {
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
    process.env.WHATSAPP_WEBHOOK_LOGS_ENABLED === "true" ||
    process.env.WHATSAPP_WEBHOOK_LOGS_ENABLED === "1"
  ) {
    const webhookLogCol = db.collection<WhatsAppWebhookLogDoc>(
      WHATSAPP_WEBHOOK_LOGS,
    );
    const logDoc: WhatsAppWebhookLogDoc = {
      id: generateRandomUUID(),
      receivedAt: new Date(),
      payload: body,
    };
    void webhookLogCol.insertOne(logDoc).catch(() => {});
  }

  const data = body as { object?: string; entry?: unknown[] };
  if (
    data.object !== "whatsapp_business_account" ||
    !Array.isArray(data.entry)
  ) {
    return NextResponse.json({ ok: true });
  }

  const convCol = db.collection<ChatConversationDoc>(CHAT_CONVERSATIONS);
  const msgCol = db.collection<ChatMessageDoc>(CHAT_MESSAGES);

  for (const entry of data.entry as Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          id: string;
          type?: string;
          text?: { body: string };
        }>;
      };
    }>;
  }>) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      const messages = change.value?.messages ?? [];
      for (const msg of messages) {
        if (msg.type !== "text" || !msg.text?.body) continue;

        const phone = normalizePhone(msg.from);
        const content = msg.text.body;
        const externalMessageId = msg.id;

        const lead = await resolveLeadFromInboundMessage({
          whatsappPhone: phone,
          source: "whatsapp",
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

        const message: ChatMessageDoc = {
          id: generateRandomUUID(),
          conversationId: conversation.id,
          senderId: null,
          senderRole: "client",
          content,
          createdAt: new Date(),
          channel: "whatsapp",
          direction: "inbound",
          externalMessageId,
        };
        await msgCol.insertOne(message);

        const wsUrl = process.env.WS_BROADCAST_URL || "http://localhost:3001";
        void fetch(`${wsUrl}/broadcast`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: lead.id,
            message: {
              id: message.id,
              content: message.content,
              createdAt: message.createdAt,
              senderId: message.senderId,
              senderRole: message.senderRole,
              channel: message.channel,
              direction: message.direction,
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
            body: `${lead.name} (WhatsApp)`,
            leadId: lead.id,
            targetUserIds,
          });
        }

        void regenerateLeadSummary(lead.id).catch(() => {});
      }
    }
  }

  return NextResponse.json({ ok: true });
}
