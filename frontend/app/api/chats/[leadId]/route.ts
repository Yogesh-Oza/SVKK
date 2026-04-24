import { db } from "@/db";
import { CHAT_CONVERSATIONS, CHAT_MESSAGES, LEADS } from "@/db/collections";
import type {
  ChatConversationDoc,
  ChatMessageDoc,
  LeadDoc,
} from "@/db/collections";
import { canAccessLead, getSessionWithRole, requireAuth } from "@/lib/rbac";
import { generateRandomUUID } from "@/helpers/generate-random-uuid";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
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

  const messages = await db
    .collection<ChatMessageDoc>(CHAT_MESSAGES)
    .find({ conversationId: conversation.id })
    .sort({ createdAt: 1 })
    .project({
      id: 1,
      content: 1,
      createdAt: 1,
      senderId: 1,
      senderRole: 1,
      channel: 1,
      direction: 1,
      attachmentUrl: 1,
      attachmentType: 1,
    })
    .toArray();

  return NextResponse.json({
    conversationId: conversation.id,
    leadId,
    messages,
  });
}
