import { CATALOG_KEYS, PERMISSION_CATALOG, WILDCARD_PERMISSION } from "../domain/permissions/catalog.js";
import { prisma } from "./prisma.js";

/**
 * Ensures DB permission rows match the code catalog (fail-fast on drift).
 */
export async function assertCatalogMatchesDatabase(): Promise<void> {
  const dbRows = await prisma.permission.findMany({ select: { key: true } });
  const dbKeys = new Set(dbRows.map((r) => r.key));
  const catalogSet = new Set<string>([...CATALOG_KEYS, WILDCARD_PERMISSION]);

  const missingInDb = CATALOG_KEYS.filter((k) => !dbKeys.has(k));
  const extraInDb = [...dbKeys].filter((k) => !catalogSet.has(k));

  if (missingInDb.length > 0 || extraInDb.length > 0) {
    const msg = [
      "Permission catalog drift detected.",
      missingInDb.length ? `Missing in DB: ${missingInDb.join(", ")}` : "",
      extraInDb.length ? `Extra in DB: ${extraInDb.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    throw new Error(msg);
  }

  const expectedCount = PERMISSION_CATALOG.length + 1;
  if (dbRows.length !== expectedCount) {
    throw new Error(
      `Permission count mismatch: catalog=${expectedCount} (incl. ${WILDCARD_PERMISSION}) db=${dbRows.length}`,
    );
  }
}
