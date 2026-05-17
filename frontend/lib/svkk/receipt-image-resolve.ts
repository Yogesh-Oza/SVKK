import { backendApi } from "./api";

export const DEFAULT_RECEIPT_HEADER_IMAGE = "/Header_Receipt.png";
export const DEFAULT_RECEIPT_FOOTER_IMAGE = "/Footer_Receipt.png";

export type ReceiptImageSource = {
  fileId?: string | null;
  shareUrl?: string | null;
  defaultPath: string;
};

function isOneDriveSharingPageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return (
    u.includes("1drv.ms") ||
    u.includes("onedrive.live.com") ||
    u.includes("sharepoint.com")
  );
}

function isDirectImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return (
    u.startsWith("data:image/") ||
    u.startsWith("blob:") ||
    u.startsWith("/") ||
    /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(u)
  );
}

function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = btoa(binary);
  return `data:${mimeType || "image/png"};base64,${base64}`;
}

async function fetchOneDriveAsDataUrl(fileId?: string | null, shareUrl?: string | null): Promise<string | null> {
  try {
    if (fileId?.trim()) {
      const { data, headers } = await backendApi.get<ArrayBuffer>(`/upload/one-drive/${fileId.trim()}/content`, {
        responseType: "arraybuffer",
      });
      const mime = (headers["content-type"] as string | undefined)?.split(";")[0]?.trim() || "image/png";
      return arrayBufferToDataUrl(data, mime);
    }
    if (shareUrl?.trim() && isOneDriveSharingPageUrl(shareUrl)) {
      const { data, headers } = await backendApi.get<ArrayBuffer>("/upload/one-drive/by-share/content", {
        params: { url: shareUrl.trim() },
        responseType: "arraybuffer",
      });
      const mime = (headers["content-type"] as string | undefined)?.split(";")[0]?.trim() || "image/png";
      return arrayBufferToDataUrl(data, mime);
    }
  } catch {
    return null;
  }
  return null;
}

/** Resolve header/footer to a URL that works in receipt print HTML (`data:` or site path). */
export async function resolveReceiptImageSource(source: ReceiptImageSource): Promise<string> {
  const share = source.shareUrl?.trim() ?? "";
  if (share && isDirectImageUrl(share) && !isOneDriveSharingPageUrl(share)) {
    return share;
  }
  const fromDrive = await fetchOneDriveAsDataUrl(source.fileId, share);
  if (fromDrive) return fromDrive;
  if (share && isOneDriveSharingPageUrl(share)) {
    return source.defaultPath;
  }
  return source.defaultPath;
}

export type ReceiptImageSettings = {
  headerImageUrl?: string;
  footerImageUrl?: string;
  headerFileId?: string;
  footerFileId?: string;
};

export async function resolveReceiptImagesForPrint(
  settings: ReceiptImageSettings,
): Promise<{ headerImageUrl: string; footerImageUrl: string }> {
  const [headerImageUrl, footerImageUrl] = await Promise.all([
    resolveReceiptImageSource({
      fileId: settings.headerFileId,
      shareUrl: settings.headerImageUrl,
      defaultPath: DEFAULT_RECEIPT_HEADER_IMAGE,
    }),
    resolveReceiptImageSource({
      fileId: settings.footerFileId,
      shareUrl: settings.footerImageUrl,
      defaultPath: DEFAULT_RECEIPT_FOOTER_IMAGE,
    }),
  ]);
  return { headerImageUrl, footerImageUrl };
}
