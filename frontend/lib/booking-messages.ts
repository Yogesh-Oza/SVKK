import { db } from "@/db";
import {
  CHAT_CONVERSATIONS,
  CHAT_MESSAGES,
} from "@/db/collections";
import type {
  ChatConversationDoc,
  ChatMessageDoc,
  LeadDoc,
  MessageChannel,
  SenderRole,
} from "@/db/collections";
import { getBookingTemplates } from "@/lib/booking-templates";
import { sendWhatsAppMessage } from "@/lib/integrations/whatsapp";
import { sendInstagramMessage } from "@/lib/integrations/instagram";
import { generateRandomUUID } from "@/helpers/generate-random-uuid";

type BookingMessageKind = "confirmation" | "reminder" | "review";

interface BookingMessageOptions {
  triggeredByUserId?: string;
  triggeredByRole?: Extract<SenderRole, "admin" | "sales">;
}

function renderTemplate(
  body: string,
  context: Record<string, string | number>,
): string {
  return body.replace(/{{(\w+)}}/g, (_, key: string) => {
    const value = context[key];
    return value == null ? "" : String(value);
  });
}

async function recordBookingChatMessage(opts: {
  lead: LeadDoc;
  content: string;
  channel: Exclude<MessageChannel, "app">;
  externalMessageId?: string | null;
  triggeredByUserId?: string;
  triggeredByRole?: Extract<SenderRole, "admin" | "sales">;
}) {
  const { lead, content, channel, externalMessageId, triggeredByRole, triggeredByUserId } =
    opts;

  // Safety: do not record empty messages.
  if (!content.trim()) return;

  const conversationsCol =
    db.collection<ChatConversationDoc>(CHAT_CONVERSATIONS);
  const messagesCol = db.collection<ChatMessageDoc>(CHAT_MESSAGES);

  const now = new Date();

  let conversation = await conversationsCol.findOne({ leadId: lead.id });

  if (!conversation) {
    const created: ChatConversationDoc = {
      id: generateRandomUUID(),
      leadId: lead.id,
      createdAt: now,
    };
    await conversationsCol.insertOne(created);
    conversation = created;
  }

  const senderRole: SenderRole = triggeredByRole ?? "admin";

  const message: ChatMessageDoc = {
    id: generateRandomUUID(),
    conversationId: conversation.id,
    senderId: triggeredByUserId ?? null,
    senderRole,
    content,
    createdAt: now,
    channel,
    direction: "outbound",
    externalMessageId: externalMessageId ?? null,
  };

  await messagesCol.insertOne(message);

  const wsUrl = process.env.WS_BROADCAST_URL || "http://localhost:3001";
  void fetch(`${wsUrl}/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId: lead.id, message }),
  }).catch(() => {});
}

export async function sendBookingMessageForLead(
  lead: LeadDoc,
  kind: BookingMessageKind,
  options?: BookingMessageOptions,
): Promise<boolean> {
  const templates = await getBookingTemplates();

  const appointmentDate =
    lead.appointmentDate instanceof Date
      ? lead.appointmentDate
      : lead.appointmentDate
        ? new Date(lead.appointmentDate)
        : null;

  const dateStr = appointmentDate
    ? appointmentDate.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";
  const timeStr = appointmentDate
    ? appointmentDate.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const dayStr = appointmentDate
    ? appointmentDate.toLocaleDateString("en-IN", {
        weekday: "long",
      })
    : "";

  const context: Record<string, string | number> = {
    client_name: lead.name,
    phone: lead.phone,
    appointment_date: dateStr,
    appointment_day: dayStr,
    appointment_time: timeStr,
    advance_amount:
      typeof lead.advanceAmount === "number" ? lead.advanceAmount : "",
    artist_name: lead.artistName ?? "",
    lead_source: lead.source,
  };

  let body: string;
  switch (kind) {
    case "confirmation":
      body = templates.bookingConfirmationBody;
      break;
    case "reminder":
      body = templates.bookingReminderBody;
      break;
    case "review":
      body = templates.bookingReviewBody;
      break;
    default:
      return false;
  }

  const content = renderTemplate(body, context);
  if (!content.trim()) return false;

  // Prefer WhatsApp when possible, then Instagram.
  if (lead.whatsappPhone) {
    const result = await sendWhatsAppMessage({
      phone: lead.whatsappPhone,
      content,
    });

    if (!result) {
      return false;
    }

    await recordBookingChatMessage({
      lead,
      content,
      channel: "whatsapp",
      externalMessageId: result.externalMessageId,
      triggeredByUserId: options?.triggeredByUserId,
      triggeredByRole: options?.triggeredByRole,
    });

    return true;
  }

  if (lead.instagramUserId) {
    const result = await sendInstagramMessage({
      instagramUserId: lead.instagramUserId,
      content,
    });

    if (!result) {
      return false;
    }

    await recordBookingChatMessage({
      lead,
      content,
      channel: "instagram",
      externalMessageId: result.externalMessageId,
      triggeredByUserId: options?.triggeredByUserId,
      triggeredByRole: options?.triggeredByRole,
    });

    return true;
  }

  return false;
}

