/**
 * WhatsApp outbound adapter - sends messages via Meta Cloud API.
 * Returns externalMessageId on success, null on failure.
 */

export type WhatsAppAttachmentType = "image" | "video" | "file";

export async function sendWhatsAppMessage({
  phone,
  content,
  attachment,
}: {
  phone: string;
  content: string;
  attachment?: { type: WhatsAppAttachmentType; url: string };
}): Promise<{ externalMessageId: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.warn(
      "[WhatsApp] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID",
    );
    return { externalMessageId: `stub-wa-${Date.now()}` };
  }

  const normalizedPhone = phone.startsWith("+") ? phone : `+${phone}`;
  const to = normalizedPhone.replace(/\D/g, "");

  const basePayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
  };

  try {
    if (attachment?.url) {
      const type = attachment.type === "file" ? "document" : attachment.type;
      const body: Record<string, unknown> = {
        ...basePayload,
        type,
        [type]: { link: attachment.url },
      };
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json()) as {
        messages?: Array<{ id: string }>;
        error?: { message: string };
      };
      if (!res.ok) {
        console.error(
          "[WhatsApp] API error:",
          json.error?.message ?? res.statusText,
        );
        return null;
      }
      const messageId = json.messages?.[0]?.id;
      if (messageId) return { externalMessageId: messageId };
      return null;
    }

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...basePayload,
          type: "text",
          text: { body: content },
        }),
      },
    );

    const json = (await res.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string };
    };

    if (!res.ok) {
      console.error(
        "[WhatsApp] API error:",
        json.error?.message ?? res.statusText,
      );
      return null;
    }

    const messageId = json.messages?.[0]?.id;
    if (messageId) return { externalMessageId: messageId };
    console.error("[WhatsApp] No message id in response");
    return null;
  } catch (err) {
    console.error("[WhatsApp] Send failed:", err);
    return null;
  }
}
