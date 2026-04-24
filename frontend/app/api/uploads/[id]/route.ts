import { db } from "@/db";
import { CHAT_UPLOADS } from "@/db/collections";
import type { ChatUploadDoc } from "@/db/collections";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await db
    .collection<ChatUploadDoc>(CHAT_UPLOADS)
    .findOne({ id }, { projection: { contentType: 1, data: 1, filename: 1 } });

  if (!doc || !doc.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = Buffer.isBuffer(doc.data)
    ? doc.data
    : Buffer.from(doc.data as ArrayBuffer);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": doc.contentType || "application/octet-stream",
      "Cache-Control": "private, max-age=31536000",
      ...(doc.filename && {
        "Content-Disposition": `inline; filename="${doc.filename.replace(/"/g, "%22")}"`,
      }),
    },
  });
}
