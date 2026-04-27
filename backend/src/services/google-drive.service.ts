import { readFileSync } from "fs";
import { Readable } from "stream";
import { google } from "googleapis";
import type { Env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

function loadCredentials(env: Env): ServiceAccountCredentials {
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as ServiceAccountCredentials;
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error("JSON must include client_email and private_key");
      }
      return parsed;
    } catch (e) {
      throw new AppError(
        "CONFIG",
        `GOOGLE_SERVICE_ACCOUNT_JSON invalid: ${e instanceof Error ? e.message : String(e)}`,
        500,
      );
    }
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const raw = readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8");
      const parsed = JSON.parse(raw) as ServiceAccountCredentials;
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error("JSON must include client_email and private_key");
      }
      return parsed;
    } catch (e) {
      throw new AppError(
        "CONFIG",
        `Could not read GOOGLE_APPLICATION_CREDENTIALS: ${e instanceof Error ? e.message : String(e)}`,
        500,
      );
    }
  }
  throw new AppError(
    "DRIVE_NOT_CONFIGURED",
    "Google Drive is not configured (set GOOGLE_DRIVE_FOLDER_ID and service account credentials).",
    503,
  );
}

/**
 * Uploads a file to the configured shared Drive folder, sets "anyone with link can view",
 * and returns a browser URL for the file.
 */
export async function uploadBufferToGoogleDrive(
  env: Env,
  input: { buffer: Buffer; mimeType: string; fileName: string },
): Promise<{ fileId: string; webViewLink: string }> {
  if (!env.GOOGLE_DRIVE_FOLDER_ID?.trim()) {
    throw new AppError(
      "DRIVE_NOT_CONFIGURED",
      "GOOGLE_DRIVE_FOLDER_ID is not set. Create a Drive folder, share it with the service account email as Editor, and set the folder ID.",
      503,
    );
  }
  const creds = loadCredentials(env);
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  await auth.authorize();
  const drive = google.drive({ version: "v3", auth });

  const safeName = input.fileName.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200) || "document";
  const uniqueName = `${Date.now()}-${safeName}`;

  const bodyStream = Readable.from(input.buffer);

  const created = await drive.files.create({
    requestBody: {
      name: uniqueName,
      parents: [env.GOOGLE_DRIVE_FOLDER_ID!.trim()],
    },
    media: {
      mimeType: input.mimeType || "application/octet-stream",
      body: bodyStream,
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const fileId = created.data.id;
  if (!fileId) {
    throw new AppError("DRIVE_UPLOAD_FAILED", "Drive did not return a file id", 502);
  }

  try {
    await drive.permissions.create({
      fileId,
      requestBody: { type: "anyone", role: "reader" },
      supportsAllDrives: true,
    });
  } catch (e) {
    throw new AppError(
      "DRIVE_PERMISSION_FAILED",
      `Uploaded file ${fileId} but could not make it link-accessible: ${e instanceof Error ? e.message : String(e)}. Check Workspace admin Drive sharing settings.`,
      502,
    );
  }

  const meta = await drive.files.get({
    fileId,
    fields: "webViewLink, webContentLink",
    supportsAllDrives: true,
  });

  const webViewLink =
    meta.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;

  return { fileId, webViewLink };
}
