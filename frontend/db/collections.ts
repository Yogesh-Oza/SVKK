export const USER = "user";
export const SESSION = "session";
export const ACCOUNT = "account";
export const VERIFICATION = "verification";
export const LEADS = "leads";
export const LEAD_STAGE_HISTORY = "lead_stage_history";
export const LEAD_REASSIGNMENT_LOGS = "lead_reassignment_logs";
export const FOLLOW_UPS = "follow_ups";
export const CHAT_CONVERSATIONS = "chat_conversations";
export const CHAT_MESSAGES = "chat_messages";
export const NOTIFICATIONS = "notifications";
export const NOTIFICATION_PREFERENCES = "notification_preferences";
export const NOTIFICATION_DELIVERIES = "notification_deliveries";
export const ALERTS = "alerts";
export const SLA_LOGS = "sla_logs";
export const TATTOO_TYPES = "tattoo_types";
export const INSTAGRAM_WEBHOOK_LOGS = "instagram_webhook_logs";
export const WHATSAPP_WEBHOOK_LOGS = "whatsapp_webhook_logs";
export const CHAT_UPLOADS = "chat_uploads";

export type LeadStage = "new" | "contacted" | "interested" | "done" | "lost";
export type LeadSource =
  | "whatsapp"
  | "instagram"
  | "manual"
  | "referral"
  | "website";
export type SlaStatus = "pending" | "met" | "breached";
export type AiScore = "hot" | "warm" | "cold";
export type FollowUpStatus = "pending" | "completed" | "missed";
export type SenderRole = "admin" | "sales" | "client";
export type MessageChannel = "app" | "whatsapp" | "instagram";
export type MessageDirection = "inbound" | "outbound";
export type NotificationType =
  | "sla_breach"
  | "follow_up_missed"
  | "new_inbound"
  | "reassigned";
export type NotificationChannel = "in_app" | "email" | "whatsapp";
export type DeliveryStatus = "pending" | "sent" | "failed";
export type AlertType = "sla_breach" | "follow_up_missed";
export type SlaLogType = "first_response" | "follow_up_missed";

export interface UserDoc {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  image?: string | null;
  role: string;
  whatsappPhone?: string | null;
  banned?: boolean;
  banReason?: string | null;
  banExpires?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadDoc {
  id: string;
  name: string;
  phone: string;
  source: LeadSource;
  stage: LeadStage;
  assignedUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  firstResponseAt?: Date | null;
  slaBreachedAt?: Date | null;
  slaStatus: SlaStatus;
  whatsappPhone?: string | null;
  instagramUserId?: string | null;
  instagramUsername?: string | null;
  aiSummary?: string | null;
  aiSummaryUpdatedAt?: Date | null;
  aiScore?: AiScore | null;
  aiScoreReason?: string | null;
  aiScoreUpdatedAt?: Date | null;
  tattooTypeId?: string | null;
}

export interface LeadStageHistoryDoc {
  id: string;
  leadId: string;
  fromStage: LeadStage;
  toStage: LeadStage;
  changedByUserId: string;
  changedAt: Date;
}

export interface LeadReassignmentLogDoc {
  id: string;
  leadId: string;
  fromUserId: string;
  toUserId: string;
  reason: string;
  changedByAdminId: string;
  changedAt: Date;
}

export interface FollowUpDoc {
  id: string;
  leadId: string;
  assignedUserId: string;
  scheduledAt: Date;
  completedAt?: Date | null;
  status: FollowUpStatus;
  note?: string | null;
  createdAt: Date;
}

export interface ChatConversationDoc {
  id: string;
  leadId: string;
  createdAt: Date;
}

export type ChatAttachmentType = "image" | "video" | "file";

export interface ChatMessageDoc {
  id: string;
  conversationId: string;
  senderId?: string | null;
  senderRole: SenderRole;
  content: string;
  createdAt: Date;
  channel: MessageChannel;
  direction?: MessageDirection | null;
  externalMessageId?: string | null;
  attachmentUrl?: string | null;
  attachmentType?: ChatAttachmentType | null;
}

export interface ChatUploadDoc {
  id: string;
  contentType: string;
  data: Buffer;
  filename?: string | null;
  createdAt: Date;
}

export interface NotificationDoc {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  message: string;
  leadId?: string | null;
  isRead: boolean;
  createdAt: Date;
}

export interface NotificationPreferenceDoc {
  userId: string;
  channel: NotificationChannel;
  type: NotificationType;
  enabled: boolean;
}

export interface NotificationDeliveryDoc {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  error?: string | null;
  attemptedAt: Date;
}

export interface AlertDoc {
  id: string;
  type: AlertType;
  leadId: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

export interface SlaLogDoc {
  id: string;
  leadId: string;
  followUpId?: string | null;
  type: SlaLogType;
  breachedAt: Date;
  resolvedAt?: Date | null;
  createdAt: Date;
}

export interface TattooTypeDoc {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstagramWebhookLogDoc {
  id: string;
  receivedAt: Date;
  payload: unknown;
}

export interface WhatsAppWebhookLogDoc {
  id: string;
  receivedAt: Date;
  payload: unknown;
}
