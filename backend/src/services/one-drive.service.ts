import type { Env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

type GraphTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GraphUploadResponse = {
  id?: string;
  webUrl?: string;
};

type GraphCreateLinkResponse = {
  link?: {
    webUrl?: string;
  };
};

function sanitizeFileName(fileName: string): string {
  return (fileName || "document")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .slice(0, 200);
}

function normalizedFolderPath(folderPath: string | undefined): string {
  const raw = (folderPath || "").trim();
  if (!raw) {
    return "";
  }
  return raw.replace(/^\/+|\/+$/g, "");
}

async function getGraphAccessToken(env: Env): Promise<string> {
  if (!env.MS_TENANT_ID || !env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET) {
    throw new AppError(
      "ONEDRIVE_NOT_CONFIGURED",
      "OneDrive is not configured (set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET).",
      503,
    );
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.MS_CLIENT_ID,
    client_secret: env.MS_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as GraphTokenResponse;
  if (!res.ok || !data.access_token) {
    const details = data.error_description || data.error || res.statusText;
    throw new AppError("ONEDRIVE_AUTH_FAILED", `Could not get Graph access token: ${details}`, 502);
  }
  return data.access_token;
}

/**
 * Uploads a document to OneDrive/SharePoint drive and returns an anonymous read-only URL.
 * Requires Graph app permission `Files.ReadWrite.All` (+ admin consent).
 */
export async function uploadBufferToOneDrive(
  env: Env,
  input: { buffer: Buffer; mimeType: string; fileName: string },
): Promise<{ fileId: string; webViewLink: string }> {
  if (!env.MS_DRIVE_ID?.trim()) {
    throw new AppError(
      "ONEDRIVE_NOT_CONFIGURED",
      "MS_DRIVE_ID is not set. Set target drive ID for policy uploads.",
      503,
    );
  }

  const accessToken = await getGraphAccessToken(env);
  const safeName = sanitizeFileName(input.fileName);
  const uniqueName = `${Date.now()}-${safeName}`;
  const folderPath = normalizedFolderPath(env.MS_DRIVE_FOLDER_PATH);
  const itemPath = folderPath ? `${folderPath}/${uniqueName}` : uniqueName;
  const encodedItemPath = itemPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  const putUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(env.MS_DRIVE_ID)}/root:/${encodedItemPath}:/content`;
  const uploadRes = await fetch(putUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": input.mimeType || "application/octet-stream",
    },
    body: new Uint8Array(input.buffer),
  });

  const uploadData = (await uploadRes.json()) as GraphUploadResponse;
  if (!uploadRes.ok || !uploadData.id) {
    throw new AppError(
      "ONEDRIVE_UPLOAD_FAILED",
      `OneDrive upload failed: ${uploadRes.status} ${uploadRes.statusText}`,
      502,
    );
  }

  const fileId = uploadData.id;
  const createLinkUrl = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(env.MS_DRIVE_ID)}/items/${encodeURIComponent(fileId)}/createLink`;
  const createLinkRes = await fetch(createLinkUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "view", scope: "anonymous" }),
  });
  const createLinkData = (await createLinkRes.json()) as GraphCreateLinkResponse;
  if (!createLinkRes.ok || !createLinkData.link?.webUrl) {
    throw new AppError(
      "ONEDRIVE_LINK_FAILED",
      "Uploaded file but failed to create anonymous read-only sharing link. Check tenant sharing policy.",
      502,
    );
  }

  return { fileId, webViewLink: createLinkData.link.webUrl };
}
