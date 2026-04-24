"use client";

import { format, isToday, isYesterday } from "date-fns";
import { useEffect, useRef } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatUser } from "../utils/chat-ui-types";

interface LeadMessageListProps {
  messages: ChatMessage[];
  users: ChatUser[];
  currentUserId?: string;
}

function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (isToday(date)) {
    return format(date, "HH:mm");
  }
  if (isYesterday(date)) {
    return `Yesterday ${format(date, "HH:mm")}`;
  }
  return format(date, "MMM d, HH:mm");
}

function formatDateHeader(dateString: string): string {
  const date = new Date(dateString);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMMM d");
}

export function LeadMessageList({
  messages,
  users,
  currentUserId = "staff",
}: LeadMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getUserById = (userId: string): ChatUser | undefined =>
    users.find((u) => u.id === userId);

  const messageGroups = (() => {
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    messages.forEach((msg) => {
      const date = format(new Date(msg.timestamp), "yyyy-MM-dd");
      const last = groups[groups.length - 1];
      if (last && last.date === date) {
        last.messages.push(msg);
      } else {
        groups.push({ date, messages: [msg] });
      }
    });
    return groups;
  })();

  const shouldShowAvatar = (msg: ChatMessage, index: number): boolean => {
    if (msg.senderId === currentUserId) return false;
    if (index === 0) return true;
    return messages[index - 1].senderId !== msg.senderId;
  };

  const shouldShowName = (msg: ChatMessage, index: number): boolean => {
    if (msg.senderId === currentUserId) return false;
    if (index === 0) return true;
    return messages[index - 1].senderId !== msg.senderId;
  };

  const isConsecutive = (index: number): boolean => {
    if (index === 0) return false;
    const prev = messages[index - 1];
    const curr = messages[index];
    const diff =
      new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
    return prev.senderId === curr.senderId && diff < 5 * 60 * 1000;
  };

  let messageIndex = 0;

  return (
    <ScrollArea className="flex-1 h-full overflow-auto">
      <div className="space-y-4 py-4 px-4">
        {messageGroups.map((group) => (
          <div key={group.date}>
            <div className="flex justify-center py-4">
              <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-4 py-1.5 rounded-full">
                {formatDateHeader(group.date)}
              </span>
            </div>
            <div className="space-y-3">
              {group.messages.map((msg) => {
                const idx = messageIndex++;
                const user = getUserById(msg.senderId);
                const isOwn = msg.senderId === currentUserId;
                const showAvatar = shouldShowAvatar(msg, idx);
                const showName = shouldShowName(msg, idx);
                const consecutive = isConsecutive(idx);
                const initials = user
                  ? user.name
                      .trim()
                      .split(/\s+/)
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase() || "?"
                  : "?";

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-3 group",
                      isOwn && "flex-row-reverse",
                      !isOwn && consecutive && "ml-12"
                    )}
                  >
                    {!isOwn && (
                      <div className="w-8 shrink-0">
                        {showAvatar && (
                          <Avatar className="size-8">
                            <AvatarFallback className="text-xs">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    )}
                    <div
                      className={cn(
                        "flex-1 max-w-[70%] min-w-0",
                        isOwn && "flex flex-col items-end"
                      )}
                    >
                      {showName && user && !isOwn && (
                        <div className="text-sm font-medium text-foreground mb-1">
                          {user.name}
                        </div>
                      )}
                      <div
                        className={cn(
                          "rounded-2xl px-4 py-2.5 text-sm shadow-sm break-words",
                          isOwn
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md",
                          consecutive && "mt-1"
                        )}
                      >
                        {msg.content ? <p>{msg.content}</p> : null}
                        {msg.attachmentUrl && (
                          <div className="mt-2">
                            {msg.attachmentType === "image" && (
                              <a
                                href={msg.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block rounded-lg overflow-hidden max-w-full"
                              >
                                <img
                                  src={msg.attachmentUrl}
                                  alt="Attachment"
                                  className="max-h-48 w-auto object-contain rounded-lg"
                                />
                              </a>
                            )}
                            {msg.attachmentType === "video" && (
                              <video
                                src={msg.attachmentUrl}
                                controls
                                className="max-h-48 rounded-lg"
                                preload="metadata"
                              />
                            )}
                            {(msg.attachmentType === "file" || !msg.attachmentType) && (
                              <a
                                href={msg.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  "text-xs underline",
                                  isOwn ? "text-primary-foreground/90" : "text-foreground"
                                )}
                              >
                                View attachment
                              </a>
                            )}
                          </div>
                        )}
                        <div
                          className={cn(
                            "flex items-center gap-1 mt-1 text-xs",
                            isOwn
                              ? "text-primary-foreground/70 justify-end"
                              : "text-muted-foreground"
                          )}
                        >
                          {formatMessageTime(msg.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
