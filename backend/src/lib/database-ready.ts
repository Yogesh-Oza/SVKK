import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const SETUP_HINT =
  "Database schema is missing. On Render, set Release Command to: npm run db:setup (Root Directory: backend). " +
  "Ensure DATABASE_URL points to the app database (not the legacy import DB).";

export function isMissingTableError(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2021"
  );
}

/** Fail fast with a clear message when Prisma tables were never created. */
export async function assertDatabaseSchemaReady(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM Permission LIMIT 1`;
  } catch (e) {
    if (isMissingTableError(e)) {
      throw new Error(SETUP_HINT);
    }
    throw e;
  }
}

export { SETUP_HINT };
