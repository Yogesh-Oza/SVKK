/**
 * Collection names and document shapes for the legacy CRM (Mongo) stack.
 * SVKK uses the Express API; these remain for sign-in, leads, and cron jobs when Mongo is configured.
 */

export const USER = "users";
export const LEADS = "leads";
export const LEAD_STAGE_HISTORY = "lead_stage_history";
export const FOLLOW_UPS = "follow_ups";
export const NOTIFICATIONS = "notifications";
export const NOTIFICATION_PREFERENCES = "notification_preferences";
export const NOTIFICATION_DELIVERIES = "notification_deliveries";
export const ALERTS = "alerts";
export const SLA_LOGS = "sla_logs";
export const CHAT_CONVERSATIONS = "chat_conversations";
export const CHAT_MESSAGES = "chat_messages";

export type UserRole = "admin" | "sales";

export type UserDoc = {
  id: string;
  email?: string;
  name?: string;
  role?: UserRole;
  whatsappPhone?: string | null;
  [key: string]: unknown;
};

export type LeadDoc = {
  id: string;
  name?: string;
  stage: string;
  assignedUserId?: string | null;
  updatedAt?: Date;
  [key: string]: unknown;
};

export type FollowUpDoc = {
  leadId: string;
  status: string;
  scheduledAt: Date;
  assignedUserId?: string | null;
  [key: string]: unknown;
};

export type NotificationType =
  | "follow_up_missed"
  | "sla_breach"
  | "other"
  | (string & {});

export type NotificationDoc = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  message: string;
  leadId: string | null;
  isRead: boolean;
  createdAt: Date;
};

export type NotificationDeliveryDoc = {
  id: string;
  [key: string]: unknown;
};

export type AlertDoc = { id: string; [key: string]: unknown };
export type SlaLogDoc = { id: string; [key: string]: unknown };
export type ChatConversationDoc = { id: string; leadId: string; [key: string]: unknown };
export type ChatMessageDoc = { id: string; conversationId: string; [key: string]: unknown };
