export type CategoryRef = { id?: string; key: string; name: string };

export function normalizeCategoryKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function buildCategoryByKeyMap(items: CategoryRef[]): Map<string, CategoryRef> {
  const map = new Map<string, CategoryRef>();
  for (const c of items) {
    const k = normalizeCategoryKey(c.key);
    if (k) map.set(k, c);
  }
  return map;
}

/** Display name from DB category row; resolves legacy categoryText key (e.g. "d" → "Category D"). */
export function resolveCategoryIdByKey(
  categoryKey: string | null | undefined,
  items: Array<{ id: string; key: string }>,
): string | undefined {
  const k = normalizeCategoryKey(categoryKey);
  if (!k) return undefined;
  return items.find((c) => normalizeCategoryKey(c.key) === k)?.id;
}

export function resolveCategoryDisplayLabel(
  category: { key?: string | null; name?: string | null } | null | undefined,
  categoryText: string | null | undefined,
  byKey?: Map<string, CategoryRef>,
): string {
  if (category?.name?.trim()) return category.name.trim();
  const relationKey = normalizeCategoryKey(category?.key);
  if (relationKey && byKey?.get(relationKey)?.name) {
    return byKey.get(relationKey)!.name;
  }
  const textKey = normalizeCategoryKey(categoryText);
  if (textKey && byKey?.get(textKey)?.name) {
    return byKey.get(textKey)!.name;
  }
  return category?.key?.trim() ?? categoryText?.trim() ?? "";
}
