import { DropdownType } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

const SKIP_LABEL = /^(na|n\/a|n\.a\.|null|none|-|—|\.|nil)$/i;

export function parseDropdownImportLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim().replace(/,+$/g, "").replace(/\s+/g, " ");
  if (!t || SKIP_LABEL.test(t)) return null;
  return t.slice(0, 128);
}

export function dropdownOptionSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/system/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 64);
}

function matchKey(raw: string): string {
  return dropdownOptionSlug(raw);
}

export type EnsureDropdownResult = { created: number; reused: number };

/**
 * Insert missing AREA / VILLAGE (or CITY) master rows from import labels.
 * Matches existing options by slug of value or label (case-insensitive).
 * Re-activates inactive matches. Does not change labels of existing rows.
 */
export async function ensureDropdownOptions(
  type: DropdownType,
  labels: Array<string | null | undefined>,
): Promise<EnsureDropdownResult> {
  const wanted = new Map<string, string>();
  for (const raw of labels) {
    const label = parseDropdownImportLabel(raw);
    if (!label) continue;
    const slug = dropdownOptionSlug(label);
    if (!slug) continue;
    if (!wanted.has(slug)) wanted.set(slug, label);
  }
  if (wanted.size === 0) return { created: 0, reused: 0 };

  const existing = await prisma.dropdownOption.findMany({
    where: { type },
    select: { id: true, value: true, label: true, isActive: true },
  });

  const byKey = new Map<string, (typeof existing)[number]>();
  for (const row of existing) {
    const v = matchKey(row.value);
    const l = matchKey(row.label);
    if (v && !byKey.has(v)) byKey.set(v, row);
    if (l && !byKey.has(l)) byKey.set(l, row);
  }

  let created = 0;
  let reused = 0;
  const toCreate: Array<{ value: string; label: string }> = [];
  const toReactivate: string[] = [];

  for (const [slug, label] of wanted) {
    const hit = byKey.get(slug);
    if (hit) {
      reused++;
      if (!hit.isActive) toReactivate.push(hit.id);
      continue;
    }
    toCreate.push({ value: slug, label });
    created++;
  }

  if (toReactivate.length > 0) {
    await prisma.dropdownOption.updateMany({
      where: { id: { in: toReactivate } },
      data: { isActive: true },
    });
  }

  if (toCreate.length > 0) {
    await prisma.dropdownOption.createMany({
      data: toCreate.map((row) => ({
        type,
        value: row.value,
        label: row.label,
        sortOrder: 0,
        isActive: true,
        isSystem: false,
      })),
      skipDuplicates: true,
    });
  }

  return { created, reused };
}

export async function ensureGeoDropdowns(opts: {
  villages?: Array<string | null | undefined>;
  areas?: Array<string | null | undefined>;
  cities?: Array<string | null | undefined>;
}): Promise<void> {
  await Promise.all([
    opts.villages?.length
      ? ensureDropdownOptions(DropdownType.VILLAGE, opts.villages)
      : Promise.resolve(),
    opts.areas?.length
      ? ensureDropdownOptions(DropdownType.AREA, opts.areas)
      : Promise.resolve(),
    opts.cities?.length
      ? ensureDropdownOptions(DropdownType.CITY, opts.cities)
      : Promise.resolve(),
  ]);
}
