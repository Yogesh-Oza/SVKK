import { db } from "@/db";
import { NOTIFICATION_PREFERENCES } from "@/db/collections";
import type { NotificationType } from "@/db/collections";

type Notification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  leadId: string | null;
};

type User = {
  id: string;
  email: string;
};

export async function sendEmailNotification(
  notification: Notification,
  user: User,
): Promise<boolean> {
  const pref = await db.collection(NOTIFICATION_PREFERENCES).findOne({
    userId: user.id,
    channel: "email",
    type: notification.type as NotificationType,
  });

  if (!pref || !pref.enabled) return false;

  return true;
}
