import { prisma } from "./prisma.js";

export type CategoryRef = { id: string; key: string; name: string };

export function normalizeCategoryKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function buildCategoryByKeyMap(rows: CategoryRef[]): Map<string, CategoryRef> {
  const map = new Map<string, CategoryRef>();
  for (const row of rows) {
    const k = normalizeCategoryKey(row.key);
    if (k) map.set(k, row);
  }
  return map;
}

/**
 * Resolves category for API responses when only legacy categoryText (e.g. "d") is stored.
 */
export function resolveCategoryRef(
  category: CategoryRef | null | undefined,
  categoryText: string | null | undefined,
  byKey: Map<string, CategoryRef>,
): CategoryRef | null {
  if (category?.id) {
    const k = normalizeCategoryKey(category.key);
    const hit = k ? byKey.get(k) : undefined;
    return hit ?? category;
  }
  const fromText = normalizeCategoryKey(categoryText ?? category?.key);
  if (fromText) {
    const hit = byKey.get(fromText);
    if (hit) return hit;
  }
  return category ?? null;
}

let cachedByKey: Map<string, CategoryRef> | null = null;
let cacheAt = 0;
const CACHE_MS = 60_000;

/** Small reference table — cache in-process for list/export/detail bursts. */
export async function loadCategoryByKeyMap(): Promise<Map<string, CategoryRef>> {
  const now = Date.now();
  if (cachedByKey && now - cacheAt < CACHE_MS) return cachedByKey;
  const rows = await prisma.category.findMany({
    select: { id: true, key: true, name: true },
    orderBy: { name: "asc" },
  });
  cachedByKey = buildCategoryByKeyMap(rows);
  cacheAt = now;
  return cachedByKey;
}

export function formatCategoryLabel(
  category: CategoryRef | null | undefined,
  categoryText: string | null | undefined,
  byKey: Map<string, CategoryRef>,
): string {
  const resolved = resolveCategoryRef(category, categoryText, byKey);
  if (resolved?.name?.trim()) return resolved.name.trim();
  return categoryText?.trim() ?? "";
}
