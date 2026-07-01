import { nanoid } from "nanoid";
import { getOfflineDb } from "./db";
import type { OfflineAnalyticsEvent, OfflineAnalyticsLogEntry } from "./types";

const MAX_LOG = 500;

export async function logOfflineEvent(
  event: OfflineAnalyticsEvent,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = getOfflineDb();
    const entry: OfflineAnalyticsLogEntry = {
      id: nanoid(),
      event,
      payload,
      at: new Date().toISOString(),
    };
    await db.analytics_log.add(entry);
    const count = await db.analytics_log.count();
    if (count > MAX_LOG) {
      const oldest = await db.analytics_log.orderBy("at").limit(count - MAX_LOG).primaryKeys();
      await db.analytics_log.bulkDelete(oldest);
    }
  } catch {
    /* ignore quota / private mode */
  }
}
