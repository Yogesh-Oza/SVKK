import { db } from "@/db";
import { NOTIFICATIONS } from "@/db/collections";
import type { NotificationDoc, NotificationType } from "@/db/collections";
import { generateRandomUUID } from "@/helpers/generate-random-uuid";

export type { NotificationType };

export type CreateNotificationParams = {
  type: NotificationType;
  title: string;
  body: string;
  leadId?: string;
  targetUserIds: string[];
};

export async function createNotification(params: CreateNotificationParams) {
  const { type, title, body, leadId, targetUserIds } = params;
  if (targetUserIds.length === 0) return;

  const docs: Omit<NotificationDoc, "isRead">[] = targetUserIds.map(
    (userId) => ({
      id: generateRandomUUID(),
      userId,
      type,
      title,
      body,
      message: body,
      leadId: leadId ?? null,
      isRead: false,
      createdAt: new Date(),
    }),
  );
  await db.collection(NOTIFICATIONS).insertMany(docs as NotificationDoc[]);
}
