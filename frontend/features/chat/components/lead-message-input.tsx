"use client";

import { Paperclip, Send, Smile, X } from "lucide-react";
import { useRef, useState } from "react";
import EmojiPicker, { type Theme } from "emoji-picker-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const ACCEPT_ATTACH =
  "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,application/pdf";

interface LeadMessageInputProps {
  onSendMessage: (content: string, file?: File | null) => void;
  disabled?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export function LeadMessageInput({
  onSendMessage,
  disabled = false,
  placeholder = "Type a message...",
  value: controlledValue,
  onChange: controlledOnChange,
}: LeadMessageInputProps) {
  const [internalMessage, setInternalMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isControlled = controlledValue !== undefined;
  const message = isControlled ? controlledValue : internalMessage;
  const setMessage = (v: string) => {
    if (isControlled && controlledOnChange) controlledOnChange(v);
    else setInternalMessage(v);
  };

  const canSend = message.trim() || selectedFile;

  const handleSend = () => {
    if (!canSend || disabled) return;
    onSendMessage(message.trim(), selectedFile ?? undefined);
    if (!isControlled) setInternalMessage("");
    else if (controlledOnChange) controlledOnChange("");
    setSelectedFile(null);
    textareaRef.current?.focus();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const onEmojiClick = (emojiData: { emoji: string }) => {
    const insert = emojiData.emoji;
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = message.slice(0, start) + insert + message.slice(end);
      setMessage(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + insert.length, start + insert.length);
      }, 0);
    } else {
      setMessage(message + insert);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.size <= 10 * 1024 * 1024) setSelectedFile(f);
    e.target.value = "";
  };

  return (
    <div className="border-t p-4">
      {selectedFile && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
          {selectedFile.type.startsWith("image/") ? (
            <img
              src={URL.createObjectURL(selectedFile)}
              alt=""
              className="h-12 w-12 rounded object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
              {selectedFile.type.startsWith("video/") ? "Video" : "File"}
            </div>
          )}
          <span className="min-w-0 flex-1 truncate text-sm">{selectedFile.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 h-8 w-8 cursor-pointer"
            onClick={() => setSelectedFile(null)}
            aria-label="Remove attachment"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
      <div className="flex items-end gap-1">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_ATTACH}
          className="hidden"
          onChange={handleFileChange}
          aria-hidden
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 h-9 w-9 cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Attach file"
        >
          <Paperclip className="size-4" />
        </Button>
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 h-9 w-9 cursor-pointer"
              disabled={disabled}
              aria-label="Insert emoji"
            >
              <Smile className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto border p-0" align="start">
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              theme={(typeof window !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light") as Theme}
              width={320}
              height={360}
            />
          </PopoverContent>
        </Popover>
        <div className="flex-1 relative min-w-0">
          <Textarea
            ref={textareaRef}
            placeholder={placeholder}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            className={cn(
              "min-h-[40px] max-h-[120px] resize-none pr-2",
              "cursor-text disabled:cursor-not-allowed",
            )}
            rows={1}
            aria-label="Message input"
          />
        </div>
        <Button
          type="button"
          size="icon"
          onClick={handleSend}
          disabled={disabled || !canSend}
          className="shrink-0 cursor-pointer disabled:cursor-not-allowed h-9 w-9"
          aria-label="Send message"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
