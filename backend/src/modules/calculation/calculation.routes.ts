import { Router } from "express";
import { z } from "zod";
import { ChartMode, PolicyChartKind } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { resolveChartsForType } from "../policy/policy.service.js";
import { getCachedMatrix, invalidateChartCache } from "../premium/chart-cache.js";
import { calculatePremium } from "../premium/premium.engine.js";
import type { PremiumMatrixJson } from "../premium/premium.types.js";

/* ----------------------------- snapshot shapes ----------------------------- */

/** Frontend-shaped band (matches `frontend/lib/svkk/premium/types.ts#ChartBand`). */
const ChartBandSchema = z
  .object({
    label: z.string().min(1),
    min: z.number().int().min(0),
    max: z.number().int().min(0),
    premiums: z.record(z.coerce.number().positive()),
  })
  .refine((b) => b.max >= b.min, { message: "min must be <= max" });

const DiscountConfigSchema = z.object({
  type: z.enum(["count", "daughter", "different"]),
  different: z.enum(["yes", "no"]).optional(),
  holder: z.union([z.string(), z.number()]).optional(),
  member: z.union([z.string(), z.number()]).optional(),
  daughter: z.union([z.string(), z.number()]).optional(),
  byCount: z.record(z.coerce.number().min(0).max(100)).optional(),
});

const SnapshotPolicySchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "use lowercase letters, digits and underscores"),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  mode: z.enum(["same", "different"]),
  discount: DiscountConfigSchema,
  charts: z.object({
    combined: z.array(ChartBandSchema).optional(),
    holder: z.array(ChartBandSchema).optional(),
    member: z.array(ChartBandSchema).optional(),
  }),
});

const SnapshotBodySchema = z.object({
  policyTypes: z.array(SnapshotPolicySchema).max(50),
});

type SnapshotPolicy = z.infer<typeof SnapshotPolicySchema>;
type FrontendBand = z.infer<typeof ChartBandSchema>;

/** Backend bands+matrix → frontend ChartBand[]. */
function matrixToBands(raw: unknown): FrontendBand[] {
  const m = raw as Partial<PremiumMatrixJson> | null | undefined;
  if (!m || !Array.isArray(m.bands) || !Array.isArray(m.siColumns) || !Array.isArray(m.matrix)) {
    return [];
  }
  return m.bands.map((b, i) => {
    const premiums: Record<string, number> = {};
    m.siColumns!.forEach((si, j) => {
      const cell = m.matrix![i]?.[j];
      if (typeof cell === "number" && Number.isFinite(cell) && cell > 0) {
        premiums[String(si)] = cell;
      }
    });
    return { label: b.label, min: b.minAge, max: b.maxAge, premiums };
  });
}

/** Frontend ChartBand[] → backend bands+matrix Json. */
function bandsToMatrix(bands: FrontendBand[]): PremiumMatrixJson {
  const siSet = new Set<number>();
  for (const b of bands) for (const k of Object.keys(b.premiums)) siSet.add(Number(k));
  const siColumns = [...siSet].filter(Number.isFinite).sort((a, b) => a - b);
  const matrix = bands.map((b) =>
    siColumns.map((si) => Number(b.premiums[String(si)] ?? 0)),
  );
  return {
    bands: bands.map((b) => ({ label: b.label, minAge: b.min, maxAge: b.max })),
    siColumns,
    matrix,
  };
}

function modeToChartMode(mode: "same" | "different"): ChartMode {
  return mode === "different" ? ChartMode.HOLDER_MEMBER : ChartMode.SINGLE;
}
function chartModeToMode(m: ChartMode): "same" | "different" {
  return m === ChartMode.HOLDER_MEMBER ? "different" : "same";
}

export function createCalculationRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  /** Dropdown data for the premium calculator (same permission as /live). */
  r.get("/reference/policy-types", requirePermission("calculation:live"), async (_req, res, next) => {
    try {
      const rows = await prisma.policyType.findMany({
        orderBy: { name: "asc" },
        select: { id: true, key: true, name: true, chartMode: true, description: true },
      });
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  r.get("/reference/charts", requirePermission("calculation:live"), async (req, res, next) => {
    try {
      const policyTypeId = z.string().min(1).parse(req.query.policyTypeId);
      const rows = await prisma.policyChart.findMany({
        where: { policyTypeId },
        orderBy: [{ version: "desc" }, { chartKind: "asc" }],
        select: {
          id: true,
          policyTypeId: true,
          version: true,
          effectiveFrom: true,
          chartKind: true,
        },
      });
      res.json(rows);
    } catch (e) {
      next(e);
    }
  });

  /**
   * Admin chart inspector: returns all saved chart versions for a policy type,
   * including parsed age bands and supported sum insured columns for display.
   */
  r.get("/admin/chart-details", requirePermission("admin:charts"), async (req, res, next) => {
    try {
      const policyTypeId = z.string().min(1).parse(req.query.policyTypeId);
      const rows = await prisma.policyChart.findMany({
        where: { policyTypeId },
        orderBy: [{ chartKind: "asc" }, { version: "desc" }],
        select: {
          id: true,
          policyTypeId: true,
          version: true,
          effectiveFrom: true,
          chartKind: true,
          premiumMatrix: true,
        },
      });

      res.json(
        rows.map((c) => {
          const m = c.premiumMatrix as unknown as Partial<PremiumMatrixJson> | null | undefined;
          const siColumns = Array.isArray(m?.siColumns) ? m!.siColumns : [];
          return {
            id: c.id,
            policyTypeId: c.policyTypeId,
            version: c.version,
            effectiveFrom: c.effectiveFrom,
            chartKind: c.chartKind,
            siColumns,
            bands: matrixToBands(c.premiumMatrix),
          };
        }),
      );
    } catch (e) {
      next(e);
    }
  });

  /**
   * Single-shot snapshot used by the calculator + admin pages. One GET on
   * page open replaces a per-policy/charts fanout, and the admin PUT below
   * persists every change in one round trip.
   */
  r.get("/admin/snapshot", requirePermission("calculation:live"), async (_req, res, next) => {
    try {
      const types = await prisma.policyType.findMany({
        orderBy: { name: "asc" },
        include: {
          charts: {
            orderBy: [{ chartKind: "asc" }, { version: "desc" }],
          },
        },
      });
      const policyTypes = types.map((t) => {
        // Pick the latest version of each kind. The orderBy above means the
        // first row of each chartKind is the highest version.
        const seen: Record<PolicyChartKind, FrontendBand[] | undefined> = {
          COMBINED: undefined,
          HOLDER: undefined,
          MEMBER: undefined,
        };
        for (const c of t.charts) {
          if (seen[c.chartKind] !== undefined) continue;
          seen[c.chartKind] = matrixToBands(c.premiumMatrix);
        }
        return {
          id: t.id,
          key: t.key,
          name: t.name,
          description: t.description ?? "",
          mode: chartModeToMode(t.chartMode),
          discount: (t.discountConfig as SnapshotPolicy["discount"] | null) ?? null,
          charts: {
            combined: seen.COMBINED,
            holder: seen.HOLDER,
            member: seen.MEMBER,
          },
        };
      });
      res.json({ policyTypes });
    } catch (e) {
      next(e);
    }
  });

  /**
   * Bulk save. Upserts policy types by `key`, replaces the latest chart of
   * each kind with the supplied bands, persists `discountConfig`. Single PUT
   * from the admin page — minimal API surface, no fan-out.
   */
  r.put("/admin/snapshot", requirePermission("admin:charts"), async (req, res, next) => {
    try {
      const body = SnapshotBodySchema.parse(req.body);
      await prisma.$transaction(
        async (tx) => {
          for (const p of body.policyTypes) {
            const chartMode = modeToChartMode(p.mode);
            const policyType = await tx.policyType.upsert({
              where: { key: p.key },
              update: {
                name: p.name,
                description: p.description ?? null,
                chartMode,
                discountConfig: p.discount,
              },
              create: {
                key: p.key,
                name: p.name,
                description: p.description ?? null,
                chartMode,
                discountConfig: p.discount,
              },
            });

            const writes: { kind: PolicyChartKind; bands: FrontendBand[] }[] = [];
            if (p.mode === "same") {
              if (p.charts.combined?.length) {
                writes.push({ kind: PolicyChartKind.COMBINED, bands: p.charts.combined });
              }
            } else {
              if (p.charts.holder?.length) {
                writes.push({ kind: PolicyChartKind.HOLDER, bands: p.charts.holder });
              }
              if (p.charts.member?.length) {
                writes.push({ kind: PolicyChartKind.MEMBER, bands: p.charts.member });
              }
            }

            for (const w of writes) {
              const matrixJson = bandsToMatrix(w.bands);
              const existing = await tx.policyChart.findFirst({
                where: { policyTypeId: policyType.id, chartKind: w.kind },
                orderBy: { version: "desc" },
                select: { id: true, version: true },
              });
              const upserted = await tx.policyChart.upsert({
                where: {
                  policyTypeId_version_chartKind: {
                    policyTypeId: policyType.id,
                    version: existing?.version ?? 1,
                    chartKind: w.kind,
                  },
                },
                update: {
                  premiumMatrix: matrixJson as unknown as object,
                },
                create: {
                  policyTypeId: policyType.id,
                  version: 1,
                  effectiveFrom: new Date(),
                  chartKind: w.kind,
                  premiumMatrix: matrixJson as unknown as object,
                },
              });
              invalidateChartCache(upserted.id);
            }
          }
        },
        // Admin snapshot saves can be slow with many charts; avoid interactive transaction timeout (P2028).
        { maxWait: 20_000, timeout: 120_000 },
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  r.post("/live", requirePermission("calculation:live"), async (req, res, next) => {
    try {
      const body = z
        .object({
          policyTypeId: z.string().min(1),
          policyChartId: z.string().min(1),
          policyEnd: z.coerce.date(),
          sumInsured: z.number().positive(),
          members: z
            .array(
              z.object({
                name: z.string().min(1),
                dob: z.coerce.date(),
                relationship: z.string().min(1),
                gender: z.string().min(1),
                riderAmount: z.number().nonnegative().optional(),
              }),
            )
            .min(1),
        })
        .parse(req.body);

      const { chartMode, holder, member } = await resolveChartsForType(
        body.policyTypeId,
        body.policyChartId,
      );

      const holderMatrix = getCachedMatrix(holder);
      const memberMatrix = member ? getCachedMatrix(member) : null;

      const result = calculatePremium({
        chartMode,
        holderChart: holderMatrix,
        memberChart: memberMatrix,
        policyEnd: body.policyEnd,
        sumInsured: body.sumInsured,
        members: body.members,
      });

      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  return r;
}
