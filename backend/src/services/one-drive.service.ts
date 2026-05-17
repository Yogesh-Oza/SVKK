import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { Env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GraphUploadResponse = {
  id?: string;
  webUrl?: string;
  error?: { code?: string; message?: string };
};

type GraphCreateLinkResponse = {
  link?: { webUrl?: string };
};

let cachedAccessToken: string | null = null;
let cachedTokenExpiry = 0;
let currentRefreshToken: string | null = null;

const TOKEN_FILE = join(process.cwd(), ".onedrive-token.json");

async function loadPersistedRefreshToken(env: Env): Promise<string> {
  if (currentRefreshToken) return currentRefreshToken;
  try {
    const data = JSON.parse(await readFile(TOKEN_FILE, "utf8")) as { refresh_token?: string };
    if (data.refresh_token) {
      currentRefreshToken = data.refresh_token;
      return currentRefreshToken;
    }
  } catch {
    // File doesn't exist yet, use env
  }
  return env.MS_REFRESH_TOKEN || "";
}

async function persistRefreshToken(newToken: string): Promise<void> {
  currentRefreshToken = newToken;
  try {
    await writeFile(TOKEN_FILE, JSON.stringify({ refresh_token: newToken, updated_at: new Date().toISOString() }));
  } catch {
    // Non-fatal; token still works in memory
  }
}

function sanitizeFileName(fileName: string): string {
  return (fileName || "document")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .slice(0, 200);
}

function normalizedFolderPath(folderPath: string | undefined): string {
  const raw = (folderPath || "").trim();
  if (!raw) return "";
  return raw.replace(/^\/+|\/+$/g, "");
}

/**
 * Gets an access token using the delegated refresh_token flow.
 * Falls back to client_credentials if no refresh token is configured.
 */
async function getGraphAccessToken(env: Env): Promise<string> {
  if (!env.MS_TENANT_ID || !env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET) {
    throw new AppError(
      "ONEDRIVE_NOT_CONFIGURED",
      "OneDrive is not configured (set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET).",
      503,
    );
  }

  if (cachedAccessToken && Date.now() < cachedTokenExpiry) {
    return cachedAccessToken;
  }

  let body: URLSearchParams;
  let tokenUrl: string;

  const refreshToken = await loadPersistedRefreshToken(env);

  if (refreshToken) {
    // Delegated flow using refresh token (works with personal OneDrive)
    tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      refresh_token: refreshToken,
      scope: "Files.ReadWrite.All offline_access",
    });
  } else {
    tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.MS_TENANT_ID)}/oauth2/v2.0/token`;
    // App-only flow (only works with OneDrive for Business / SharePoint)
    body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.MS_CLIENT_ID,
      client_secret: env.MS_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
    });
  }

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    const details = data.error_description || data.error || res.statusText;
    throw new AppError("ONEDRIVE_AUTH_FAILED", `Could not get Graph access token: ${details}`, 502);
  }

  // Persist the new refresh token if Microsoft rotated it
  if (data.refresh_token) {
    await persistRefreshToken(data.refresh_token);
  }

  cachedAccessToken = data.access_token;
  cachedTokenExpiry = Date.now() + ((data.expires_in ?? 3500) - 120) * 1000;

  return data.access_token;
}

/**
 * Uploads a document to OneDrive and returns an anonymous read-only URL.
 * Supports both personal OneDrive (delegated/refresh_token) and OneDrive for Business (client_credentials).
 */
export async function uploadBufferToOneDrive(
  env: Env,
  input: { buffer: Buffer; mimeType: string; fileName: string },
): Promise<{ fileId: string; webViewLink: string }> {
  const accessToken = await getGraphAccessToken(env);
  const safeName = sanitizeFileName(input.fileName);
  const uniqueName = `${Date.now()}-${safeName}`;
  const folderPath = normalizedFolderPath(env.MS_DRIVE_FOLDER_PATH);
  const itemPath = folderPath ? `${folderPath}/${uniqueName}` : uniqueName;
  const encodedItemPath = itemPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  // Use /me/drive for delegated flow, /drives/{id} for app-only
  const hasRefreshToken = !!(currentRefreshToken || env.MS_REFRESH_TOKEN);
  const driveBase = hasRefreshToken
    ? "https://graph.microsoft.com/v1.0/me/drive"
    : env.MS_DRIVE_ID
      ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(env.MS_DRIVE_ID)}`
      : null;

  if (!driveBase) {
    throw new AppError(
      "ONEDRIVE_NOT_CONFIGURED",
      "Set MS_REFRESH_TOKEN (personal OneDrive) or MS_DRIVE_ID (business OneDrive).",
      503,
    );
  }

  const putUrl = `${driveBase}/root:/${encodedItemPath}:/content`;
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
    const errMsg = uploadData.error?.message || `${uploadRes.status} ${uploadRes.statusText}`;
    throw new AppError("ONEDRIVE_UPLOAD_FAILED", `OneDrive upload failed: ${errMsg}`, 502);
  }

  const fileId = uploadData.id;

  // Create anonymous sharing link
  const createLinkUrl = `${driveBase}/items/${encodeURIComponent(fileId)}/createLink`;
  const createLinkRes = await fetch(createLinkUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "view", scope: "anonymous" }),
  });
  const createLinkData = (await createLinkRes.json()) as GraphCreateLinkResponse;

  // If anonymous link fails, fall back to the webUrl from upload
  const webViewLink = createLinkData.link?.webUrl || uploadData.webUrl || "";
  if (!webViewLink) {
    throw new AppError(
      "ONEDRIVE_LINK_FAILED",
      "Uploaded file but failed to create sharing link. Check OneDrive sharing settings.",
      502,
    );
  }

  return { fileId, webViewLink };
}

/** Encodes a OneDrive/SharePoint sharing URL for Graph `/shares/{shareId}/driveItem`. */
export function encodeSharingUrlForGraph(sharingUrl: string): string {
  const base64 = Buffer.from(sharingUrl, "utf8").toString("base64");
  const encoded = base64.replace(/=+$/g, "").replace(/\//g, "_").replace(/\+/g, "-");
  return `u!${encoded}`;
}

function driveBaseForToken(env: Env): string {
  const hasRefreshToken = !!(currentRefreshToken || env.MS_REFRESH_TOKEN);
  if (hasRefreshToken) {
    return "https://graph.microsoft.com/v1.0/me/drive";
  }
  if (env.MS_DRIVE_ID) {
    return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(env.MS_DRIVE_ID)}`;
  }
  throw new AppError(
    "ONEDRIVE_NOT_CONFIGURED",
    "Set MS_REFRESH_TOKEN (personal OneDrive) or MS_DRIVE_ID (business OneDrive).",
    503,
  );
}

export async function downloadOneDriveFileById(
  env: Env,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const accessToken = await getGraphAccessToken(env);
  const driveBase = driveBaseForToken(env);
  const url = `${driveBase}/items/${encodeURIComponent(fileId)}/content`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new AppError(
      "ONEDRIVE_DOWNLOAD_FAILED",
      `Could not download file from OneDrive (${res.status})`,
      502,
    );
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType };
}

/** Resolve a sharing page URL (1drv.ms, onedrive.live.com) to file bytes via Graph. */
export async function downloadOneDriveFileBySharingUrl(
  env: Env,
  sharingUrl: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const accessToken = await getGraphAccessToken(env);
  const shareId = encodeSharingUrlForGraph(sharingUrl.trim());
  const url = `https://graph.microsoft.com/v1.0/shares/${encodeURIComponent(shareId)}/driveItem/content`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new AppError(
      "ONEDRIVE_DOWNLOAD_FAILED",
      `Could not resolve OneDrive sharing link (${res.status}). Re-upload the image from Receipt Settings.`,
      502,
    );
  }
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, mimeType };
}

export function isOneDriveSharingPageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return (
    u.includes("1drv.ms") ||
    u.includes("onedrive.live.com") ||
    u.includes("sharepoint.com") ||
    u.includes("/personal/") ||
    u.startsWith("https://d.docs.live.net")
  );
}
