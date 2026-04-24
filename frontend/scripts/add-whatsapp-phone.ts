import postgres from "postgres";
import "dotenv/config";

const sql = postgres(process.env.DATABASE_URL!);

async function addWhatsAppPhoneColumn() {
  try {
    await sql`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "whatsapp_phone" text`;
    console.log("Successfully added whatsapp_phone column to user table.");
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

addWhatsAppPhoneColumn();
