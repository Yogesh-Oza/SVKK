import {
  DropdownType,
  MigrationUnmatchedAction,
  type PrismaClient,
} from "@prisma/client";
import {
  GENDER_MAP,
  PAYMENT_MODE_FALLBACK,
  PAYMENT_MODE_MAP,
  RELATION_MAP,
  TRANSACTION_STATUS_MAP,
  normalizeSumInsuredValue,
} from "./config/dropdown-mappings.js";
import { DEFAULT_FUZZY_THRESHOLD, findBestFuzzyMatch, type FuzzyCandidate } from "./fuzzy-match.js";
import { normalizeLegacyText, toDropdownLabel, toDropdownValueSlug } from "./normalize.js";

export type ResolveAction = "exact" | "fuzzy" | "created" | "static_map";

export interface ResolveResult {
  value: string;
  label: string;
  action: ResolveAction;
  fuzzyScore?: number;
  matchedToValue?: string;
}

export class DropdownResolver {
  private maps = new Map<DropdownType, Map<string, FuzzyCandidate>>();
  private dropdownsCreated = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly migrationRunId: string | null,
    private readonly dryRun: boolean,
  ) {}

  static async load(
    prisma: PrismaClient,
    migrationRunId: string | null,
    dryRun: boolean,
  ): Promise<DropdownResolver> {
    const resolver = new DropdownResolver(prisma, migrationRunId, dryRun);
    await resolver.refreshFromDb();
    return resolver;
  }

  async refreshFromDb(): Promise<void> {
    const rows = await this.prisma.dropdownOption.findMany({
      where: { isActive: true },
      select: { type: true, value: true, label: true },
    });
    this.maps.clear();
    for (const r of rows) {
      const byType = this.maps.get(r.type) ?? new Map<string, FuzzyCandidate>();
      byType.set(normalizeLegacyText(r.value), {
        key: normalizeLegacyText(r.value),
        value: r.value,
        label: r.label,
      });
      byType.set(normalizeLegacyText(r.label), {
        key: normalizeLegacyText(r.label),
        value: r.value,
        label: r.label,
      });
      this.maps.set(r.type, byType);
    }
  }

  getDropdownsCreatedCount(): number {
    return this.dropdownsCreated;
  }

  private candidates(type: DropdownType): FuzzyCandidate[] {
    const m = this.maps.get(type);
    if (!m) return [];
    const seen = new Set<string>();
    const out: FuzzyCandidate[] = [];
    for (const c of m.values()) {
      if (seen.has(c.value)) continue;
      seen.add(c.value);
      out.push(c);
    }
    return out;
  }

  private registerCandidate(type: DropdownType, value: string, label: string): void {
    const byType = this.maps.get(type) ?? new Map<string, FuzzyCandidate>();
    const key = normalizeLegacyText(value);
    const cand = { key, value, label };
    byType.set(key, cand);
    byType.set(normalizeLegacyText(label), cand);
    this.maps.set(type, byType);
  }

  private async logUnmatched(
    type: DropdownType,
    legacyRaw: string,
    normalizedKey: string,
    resolvedValue: string,
    action: MigrationUnmatchedAction,
    fuzzyScore?: number,
    matchedToValue?: string,
  ): Promise<void> {
    if (!this.migrationRunId || this.dryRun) return;
    await this.prisma.migrationUnmatchedValue.create({
      data: {
        migrationRunId: this.migrationRunId,
        dropdownType: type,
        legacyRaw: legacyRaw.slice(0, 255),
        normalizedKey,
        resolvedValue,
        action,
        fuzzyScore,
        matchedToValue,
      },
    });
  }

  async resolveDropdown(
    type: DropdownType,
    raw: string | null | undefined,
    staticMap?: Record<string, string>,
  ): Promise<string | null> {
    if (raw == null || !String(raw).trim()) return null;
    const legacyRaw = String(raw).trim();
    const normalized = normalizeLegacyText(legacyRaw);

    if (staticMap) {
      const mapped = staticMap[normalized] ?? staticMap[legacyRaw.toLowerCase()];
      if (mapped) return mapped;
    }

    const pool = this.candidates(type);
    const exact = pool.find((c) => c.key === normalized);
    if (exact) return exact.value;

    const fuzzy = findBestFuzzyMatch(legacyRaw, pool, DEFAULT_FUZZY_THRESHOLD);
    if (fuzzy) {
      await this.logUnmatched(
        type,
        legacyRaw,
        normalized,
        fuzzy.match.value,
        MigrationUnmatchedAction.fuzzy,
        fuzzy.score,
        fuzzy.match.value,
      );
      return fuzzy.match.value;
    }

    const value = toDropdownValueSlug(normalized, "unknown");
    const label = toDropdownLabel(legacyRaw);

    if (!this.dryRun) {
      await this.prisma.dropdownOption.upsert({
        where: { type_value: { type, value } },
        update: { label, isActive: true },
        create: { type, value, label, isSystem: false, isActive: true },
      });
    }
    this.dropdownsCreated += 1;
    this.registerCandidate(type, value, label);
    await this.logUnmatched(type, legacyRaw, normalized, value, MigrationUnmatchedAction.created);
    return value;
  }

  resolveRelation(raw: string | null | undefined): Promise<string | null> {
    return this.resolveDropdown(DropdownType.RELATION, raw, RELATION_MAP);
  }

  resolveGender(raw: string | null | undefined): Promise<string | null> {
    return this.resolveDropdown(DropdownType.GENDER, raw, GENDER_MAP).then(
      (v) => v ?? "O",
    );
  }

  resolvePaymentMode(raw: string | null | undefined): Promise<string> {
    return this.resolveDropdown(DropdownType.PAYMENT_MODE, raw, PAYMENT_MODE_MAP).then(
      (v) => v ?? PAYMENT_MODE_FALLBACK,
    );
  }

  resolveTransactionStatus(raw: string | null | undefined): Promise<string | null> {
    return this.resolveDropdown(DropdownType.TRANSACTION_STATUS, raw, TRANSACTION_STATUS_MAP);
  }

  resolveArea(raw: string | null | undefined): Promise<string | null> {
    return this.resolveDropdown(DropdownType.AREA, raw);
  }

  resolveVillage(raw: string | null | undefined): Promise<string | null> {
    return this.resolveDropdown(DropdownType.VILLAGE, raw);
  }

  resolveCity(raw: string | null | undefined): Promise<string | null> {
    return this.resolveDropdown(DropdownType.CITY, raw);
  }

  async resolveSumInsured(raw: string | null | undefined): Promise<string | null> {
    const digits = normalizeSumInsuredValue(raw);
    if (!digits) return null;
    return this.resolveDropdown(DropdownType.SUM_INSURED, digits);
  }
}
