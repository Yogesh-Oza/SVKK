import { Router } from "express";
import { z } from "zod";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import { prisma } from "../../lib/prisma.js";
import { resolveChartsForType } from "../policy/policy.service.js";
import { getCachedMatrix } from "../premium/chart-cache.js";
import { calculatePremium } from "../premium/premium.engine.js";
export function createCalculationRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

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
