import type { SvkkUser } from "@/lib/svkk/types";
import { getOfflineDb } from "./db";
import { AUTH_SNAPSHOT_TTL_MS } from "./types";

export async function saveAuthSnapshot(user: SvkkUser): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = getOfflineDb();
  await db.auth_snapshot.put({
    key: "current",
    user,
    savedAt: new Date().toISOString(),
  });
}

export async function loadAuthSnapshot(): Promise<SvkkUser | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = getOfflineDb();
    const row = await db.auth_snapshot.get("current");
    if (!row) return null;
    const age = Date.now() - new Date(row.savedAt).getTime();
    if (age > AUTH_SNAPSHOT_TTL_MS) return null;
    return row.user;
  } catch {
    return null;
  }
}

export async function clearAuthSnapshot(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = getOfflineDb();
  await db.auth_snapshot.delete("current");
}
