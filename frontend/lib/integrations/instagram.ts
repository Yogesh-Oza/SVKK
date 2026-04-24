/**
 * Instagram outbound adapter - sends DMs via Meta Graph API.
 * Returns externalMessageId on success, null on failure.
 */

export type InstagramAttachmentType = "image" | "video" | "file";

export async function sendInstagramMessage({
  instagramUserId,
  content,
  attachment,
}: {
  instagramUserId: string;
  content: string;
  attachment?: { type: InstagramAttachmentType; url: string };
}): Promise<{ externalMessageId: string } | null> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!token) {
    console.warn("[Instagram] Missing INSTAGRAM_ACCESS_TOKEN");
    return { externalMessageId: `stub-ig-${Date.now()}` };
  }

  const url = "https://graph.instagram.com/v21.0/me/messages";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  try {
    if (attachment?.url) {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          recipient: { id: String(instagramUserId) },
          message: {
            attachment: {
              type: attachment.type,
              payload: { url: attachment.url },
            },
          },
        }),
      });
      const json = (await res.json()) as {
        message_id?: string;
        error?: { message: string };
      };
      if (!res.ok) {
        console.error(
          "[Instagram] API error:",
          json.error?.message ?? res.statusText,
        );
        return null;
      }
      if (json.message_id) return { externalMessageId: json.message_id };
      console.error("[Instagram] No message_id in response");
      return null;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        recipient: { id: String(instagramUserId) },
        message: { text: content },
      }),
    });

    const json = (await res.json()) as {
      message_id?: string;
      error?: { message: string };
    };

    if (!res.ok) {
      console.error(
        "[Instagram] API error:",
        json.error?.message ?? res.statusText,
      );
      return null;
    }

    const messageId = json.message_id;
    if (messageId) return { externalMessageId: messageId };
    console.error("[Instagram] No message_id in response");
    return null;
  } catch (err) {
    console.error("[Instagram] Send failed:", err);
    return null;
  }
}
