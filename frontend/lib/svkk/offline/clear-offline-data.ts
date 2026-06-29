import { getOfflineDb } from "./db";
import { logOfflineEvent } from "./analytics-log";

export async function clearOfflineData(options?: { hadPendingMutations?: boolean }): Promise<void> {
  const db = getOfflineDb();
  await db.delete();
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("svkk-")).map((k) => caches.delete(k)));
  }
  await logOfflineEvent("cache_cleared", {
    hadPendingMutations: options?.hadPendingMutations ?? false,
  });
}

export async function countPendingMutations(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  try {
    const db = getOfflineDb();
    return db.mutations
      .where("status")
      .anyOf(["pending", "syncing", "conflict", "failed"])
      .count();
  } catch {
    return 0;
  }
}
