import { DropdownType, Prisma } from "@prisma/client";
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

type WantedByType = Map<DropdownType, Map<string, string>>;

function collectWanted(
  type: DropdownType,
  labels: Array<string | null | undefined> | undefined,
  into: WantedByType,
): void {
  if (!labels?.length) return;
  let bucket = into.get(type);
  if (!bucket) {
    bucket = new Map();
    into.set(type, bucket);
  }
  for (const raw of labels) {
    const label = parseDropdownImportLabel(raw);
    if (!label) continue;
    const slug = dropdownOptionSlug(label);
    if (!slug) continue;
    if (!bucket.has(slug)) bucket.set(slug, label);
  }
}

export type EnsureDropdownResult = { created: number; reused: number };

/**
 * Insert missing dropdown rows for one type.
 * Loads existing options once, then bulk-inserts with skipDuplicates
 * (MySQL INSERT IGNORE / ON CONFLICT DO NOTHING).
 */
export async function ensureDropdownOptions(
  type: DropdownType,
  labels: Array<string | null | undefined>,
): Promise<EnsureDropdownResult> {
  return syncDropdownLabels(new Map([[type, labels]]));
}

/**
 * Sync Village / Area / City in one findMany + one createMany (not per CSV row).
 */
export async function ensureGeoDropdowns(opts: {
  villages?: Array<string | null | undefined>;
  areas?: Array<string | null | undefined>;
  cities?: Array<string | null | undefined>;
}): Promise<EnsureDropdownResult> {
  return syncDropdownLabels(
    new Map([
      [DropdownType.VILLAGE, opts.villages],
      [DropdownType.AREA, opts.areas],
      [DropdownType.CITY, opts.cities],
    ]),
  );
}

async function syncDropdownLabels(
  labelsByType: Map<DropdownType, Array<string | null | undefined> | undefined>,
): Promise<EnsureDropdownResult> {
  const wanted: WantedByType = new Map();
  for (const [type, labels] of labelsByType) {
    collectWanted(type, labels, wanted);
  }
  if (wanted.size === 0) return { created: 0, reused: 0 };

  const types = [...wanted.keys()];
  const existing = await prisma.dropdownOption.findMany({
    where: { type: { in: types } },
    select: { id: true, type: true, value: true, label: true, isActive: true },
  });

  const byTypeKey = new Map<DropdownType, Map<string, (typeof existing)[number]>>();
  for (const row of existing) {
    let map = byTypeKey.get(row.type);
    if (!map) {
      map = new Map();
      byTypeKey.set(row.type, map);
    }
    const v = matchKey(row.value);
    const l = matchKey(row.label);
    if (v && !map.has(v)) map.set(v, row);
    if (l && !map.has(l)) map.set(l, row);
  }

  let created = 0;
  let reused = 0;
  const toCreate: Array<{
    type: DropdownType;
    value: string;
    label: string;
    sortOrder: number;
    isActive: boolean;
    isSystem: boolean;
  }> = [];
  const toReactivate: string[] = [];

  for (const [type, slugs] of wanted) {
    const existingForType = byTypeKey.get(type) ?? new Map();
    for (const [slug, label] of slugs) {
      const hit = existingForType.get(slug);
      if (hit) {
        reused++;
        if (!hit.isActive) toReactivate.push(hit.id);
        continue;
      }
      toCreate.push({
        type,
        value: slug,
        label,
        sortOrder: 0,
        isActive: true,
        isSystem: false,
      });
      created++;
    }
  }

  if (toReactivate.length > 0) {
    await prisma.dropdownOption.updateMany({
      where: { id: { in: toReactivate } },
      data: { isActive: true },
    });
  }

  if (toCreate.length > 0) {
    await prisma.dropdownOption.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }

  return { created, reused };
}

type DistinctRow = { value: string };

async function distinctNonEmpty(query: Prisma.Sql): Promise<string[]> {
  const rows = await prisma.$queryRaw<DistinctRow[]>(query);
  const out: string[] = [];
  for (const row of rows) {
    if (row.value) out.push(row.value);
  }
  return out;
}

/**
 * One DISTINCT per geo column (uses policy village/area indexes). Runs once after import.
 */
export async function distinctGeoValuesFromRecords(): Promise<{
  villages: string[];
  areas: string[];
  cities: string[];
}> {
  const [policyVillages, policyAreas, policyCities, claimVillages, claimAreas] = await Promise.all([
    distinctNonEmpty(
      Prisma.sql`SELECT DISTINCT village AS value FROM policy WHERE deletedAt IS NULL AND village IS NOT NULL AND village <> ''`,
    ),
    distinctNonEmpty(
      Prisma.sql`SELECT DISTINCT area AS value FROM policy WHERE deletedAt IS NULL AND area IS NOT NULL AND area <> ''`,
    ),
    distinctNonEmpty(
      Prisma.sql`SELECT DISTINCT city AS value FROM policy WHERE deletedAt IS NULL AND city IS NOT NULL AND city <> ''`,
    ),
    distinctNonEmpty(
      Prisma.sql`SELECT DISTINCT village AS value FROM claim WHERE village IS NOT NULL AND village <> ''`,
    ),
    distinctNonEmpty(
      Prisma.sql`SELECT DISTINCT hospitalArea AS value FROM claim WHERE hospitalArea IS NOT NULL AND hospitalArea <> ''`,
    ),
  ]);

  return {
    villages: [...policyVillages, ...claimVillages],
    areas: [...policyAreas, ...claimAreas],
    cities: policyCities,
  };
}

/** Create missing Area / Village / City options from values already stored on policies and claims. */
export async function backfillGeoDropdownsFromRecords(): Promise<EnsureDropdownResult> {
  const geo = await distinctGeoValuesFromRecords();
  return ensureGeoDropdowns(geo);
}
