import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const SETUP_HINT =
  "Database schema is missing. On Render, set Release Command to: npm run db:setup (Root Directory: backend). " +
  "Ensure DATABASE_URL points to the app database (not the legacy import DB).";

export function isMissingTableError(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (e.code === "P2021") return true;
  // Raw SQL on MySQL when the table is missing (e.g. wrong casing vs @@map).
  if (e.code === "P2010" && e.meta?.code === "1146") return true;
  return false;
}

/** Fail fast with a clear message when Prisma tables were never created. */
export async function assertDatabaseSchemaReady(): Promise<void> {
  try {
    await prisma.permission.findFirst({ select: { id: true } });
  } catch (e) {
    if (isMissingTableError(e)) {
      throw new Error(SETUP_HINT);
    }
    throw e;
  }
}

export { SETUP_HINT };
