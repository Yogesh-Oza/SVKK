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
 * Resolve CSV / free-text Category to a Category row.
 * Accepts key (`d`, `A`), display name (`Category D`), or `category d`.
 */
export function resolveCategoryFromInput(
  raw: string | null | undefined,
  categories: CategoryRef[],
): CategoryRef | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const norm = normalizeCategoryKey(trimmed);
  if (!norm) return null;

  const byKey = buildCategoryByKeyMap(categories);
  const keyHit = byKey.get(norm);
  if (keyHit) return keyHit;

  for (const row of categories) {
    if (normalizeCategoryKey(row.name) === norm) return row;
  }

  const stripped = norm.replace(/^category\s+/, "").trim();
  if (stripped && stripped !== norm) {
    const strippedHit = byKey.get(stripped);
    if (strippedHit) return strippedHit;
  }

  return null;
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
    for (const row of byKey.values()) {
      if (normalizeCategoryKey(row.name) === fromText) return row;
    }
    const stripped = fromText.replace(/^category\s+/, "").trim();
    if (stripped && stripped !== fromText) {
      const strippedHit = byKey.get(stripped);
      if (strippedHit) return strippedHit;
    }
  }
  return category ?? null;
}

let cachedByKey: Map<string, CategoryRef> | null = null;
let cachedRows: CategoryRef[] | null = null;
let cacheAt = 0;
const CACHE_MS = 60_000;

/** Category rows for CSV import / resolution (shared cache with {@link loadCategoryByKeyMap}). */
export async function loadCategoryRefs(): Promise<CategoryRef[]> {
  const now = Date.now();
  if (cachedRows && cachedByKey && now - cacheAt < CACHE_MS) return cachedRows;
  const rows = await prisma.category.findMany({
    select: { id: true, key: true, name: true },
    orderBy: { name: "asc" },
  });
  cachedRows = rows;
  cachedByKey = buildCategoryByKeyMap(rows);
  cacheAt = now;
  return rows;
}

/** Small reference table — cache in-process for list/export/detail bursts. */
export async function loadCategoryByKeyMap(): Promise<Map<string, CategoryRef>> {
  const rows = await loadCategoryRefs();
  return buildCategoryByKeyMap(rows);
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

export function categoryAllowedLabels(categories: CategoryRef[]): string {
  return categories.map((c) => `${c.name} (${c.key})`).join(", ");
}
