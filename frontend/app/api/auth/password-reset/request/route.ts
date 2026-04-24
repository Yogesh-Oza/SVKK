import { db } from "@/db";
import { USER } from "@/db/collections";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email(),
});

function hashWithSecret(value: string) {
  const secret = process.env.AUTH_SECRET ?? "dev-secret";
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function POST(req: Request) {
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const user = await db.collection(USER).findOne<{ id: string }>({ email });

  // Always respond 200 to avoid user enumeration.
  if (!user?.id) {
    return NextResponse.json({ ok: true });
  }

  const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const otpHash = hashWithSecret(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.collection(USER).updateOne(
    { id: user.id },
    {
      $set: {
        passwordResetOtpHash: otpHash,
        passwordResetOtpExpiresAt: expiresAt,
      },
      $unset: {
        passwordResetTokenHash: "",
        passwordResetTokenExpiresAt: "",
      },
    },
  );

  // TODO: hook into a real email provider. For now, we avoid leaking the OTP in production.
  const includeOtp = process.env.NODE_ENV !== "production";

  return NextResponse.json(includeOtp ? { ok: true, otp } : { ok: true });
}
