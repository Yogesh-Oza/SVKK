"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeadChatHeader } from "@/features/chat/components/lead-chat-header";
import { LeadMessageInput } from "@/features/chat/components/lead-message-input";
import { LeadMessageList } from "@/features/chat/components/lead-message-list";
import type { ChatMessage as UIChatMessage, ChatUser } from "@/features/chat/utils/chat-ui-types";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type MessageChannel = "app" | "whatsapp" | "instagram";

interface ApiMessage {
  id: string;
  content: string;
  createdAt: string;
  senderRole: "admin" | "sales" | "client";
  channel: MessageChannel;
  direction?: "inbound" | "outbound" | null;
  attachmentUrl?: string | null;
  attachmentType?: "image" | "video" | "file" | null;
}

interface LeadChatPanelProps {
  leadId: string;
  leadName: string;
  canReply: boolean;
  whatsappPhone?: string | null;
  instagramUserId?: string | null;
}

const CHANNEL_LABELS: Record<MessageChannel, string> = {
  app: "App",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

function mapApiToUiMessage(m: ApiMessage): UIChatMessage {
  return {
    id: m.id,
    content: m.content,
    timestamp: m.createdAt,
    senderId: m.senderRole === "client" ? "client" : "staff",
    type: (m.attachmentType as UIChatMessage["type"]) ?? "text",
    isEdited: false,
    reactions: [],
    replyTo: null,
    attachmentUrl: m.attachmentUrl ?? null,
    attachmentType: m.attachmentType ?? null,
  };
}

export function LeadChatPanel({
  leadId,
  leadName,
  canReply,
  whatsappPhone,
  instagramUserId,
}: LeadChatPanelProps) {
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [channel, setChannel] = useState<MessageChannel>(() =>
    whatsappPhone && !instagramUserId
      ? "whatsapp"
      : instagramUserId && !whatsappPhone
        ? "instagram"
        : "app"
  );

  const channels: MessageChannel[] = ["app"];
  if (whatsappPhone) channels.push("whatsapp");
  if (instagramUserId) channels.push("instagram");

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chats/${leadId}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.messages)) {
        setMessages(
          data.messages.map((m: ApiMessage) => ({
            id: m.id,
            content: m.content,
            createdAt: m.createdAt,
            senderRole: m.senderRole,
            channel: m.channel,
            direction: m.direction,
            attachmentUrl: m.attachmentUrl ?? null,
            attachmentType: m.attachmentType ?? null,
          }))
        );
      } else if (res.status === 403 || res.status === 404) {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchMessages();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleSend = async (content: string, file?: File | null) => {
    const trimmed = content.trim();
    if ((!trimmed && !file) || !canReply || sending) return;

    setSending(true);
    try {
      let res: Response;
      if (file) {
        const formData = new FormData();
        formData.set("content", trimmed);
        formData.set("channel", channel);
        formData.set("file", file);
        res = await fetch(`/api/chats/${leadId}/send`, {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch(`/api/chats/${leadId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed, channel }),
        });
      }
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed to send message");
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: data.id,
          content: data.content ?? "",
          createdAt: data.createdAt,
          senderRole: data.senderRole,
          channel: data.channel,
          direction: data.direction ?? "outbound",
          attachmentUrl: data.attachmentUrl ?? null,
          attachmentType: data.attachmentType ?? null,
        },
      ]);
      setInputValue("");
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const uiMessages: UIChatMessage[] = messages.map(mapApiToUiMessage);
  const users: ChatUser[] = [
    { id: "client", name: leadName },
    { id: "staff", name: "You" },
  ];

  return (
    <Card className="flex h-full min-h-[320px] flex-col">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-0 p-0">
        <div className="shrink-0 border-b px-4 py-3">
          <LeadChatHeader
            leadName={leadName}
            channelLabel={CHANNEL_LABELS[channel]}
          />
        </div>

        <div className="flex-1 min-h-0 flex flex-col" style={{ minHeight: 200 }}>
          {loading ? (
            <div className="flex items-center justify-center flex-1 py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="flex-1 flex items-center justify-center py-8 text-center text-sm text-muted-foreground">
              No messages yet. Start the conversation below.
            </p>
          ) : (
            <LeadMessageList
              messages={uiMessages}
              users={users}
              currentUserId="staff"
            />
          )}
        </div>

        {channels.length > 1 && (
          <div className="flex flex-wrap gap-1 px-4 py-2 border-t">
            {channels.map((ch) => (
              <Button
                key={ch}
                type="button"
                variant={channel === ch ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-xs cursor-pointer"
                onClick={() => setChannel(ch)}
              >
                {CHANNEL_LABELS[ch]}
              </Button>
            ))}
          </div>
        )}

        {canReply && (
          <LeadMessageInput
            onSendMessage={handleSend}
            disabled={sending}
            value={inputValue}
            onChange={setInputValue}
          />
        )}
      </CardContent>
    </Card>
  );
}
