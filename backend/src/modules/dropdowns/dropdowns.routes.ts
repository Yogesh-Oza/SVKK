import { Router } from "express";
import { z } from "zod";
import { DropdownType } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { prisma } from "../../lib/prisma.js";

const dropdownTypeValues = Object.values(DropdownType) as [DropdownType, ...DropdownType[]];

/**
 * Public reference data for the policy add/edit form dropdowns.
 * Any authenticated user can read; admin CRUD lives under /admin/dropdowns.
 *
 * `VILLAGE` results merge `UserVillage` distinct names (read-only) with
 * `DropdownOption` rows so supervisor-scoping data automatically populates the dropdown.
 */
export function createDropdownsRouter(env: Env) {
  const r = Router();
  r.use(requireAuth(env));

  r.get("/", async (req, res, next) => {
    try {
      const typeFilter = req.query.type
        ? z.enum(dropdownTypeValues).parse(req.query.type)
        : undefined;

      const where = typeFilter
        ? { type: typeFilter, isActive: true }
        : { isActive: true };

      const rows = await prisma.dropdownOption.findMany({
        where,
        orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
      });

      const grouped: Record<string, { value: string; label: string }[]> = {};
      for (const t of dropdownTypeValues) {
        if (!typeFilter || typeFilter === t) grouped[t] = [];
      }
      for (const row of rows) {
        grouped[row.type]!.push({ value: row.value, label: row.label });
      }

      if (!typeFilter || typeFilter === DropdownType.VILLAGE) {
        const userVillages = await prisma.userVillage.findMany({
          distinct: ["village"],
          select: { village: true },
          orderBy: { village: "asc" },
        });
        const dbValues = new Set(grouped[DropdownType.VILLAGE]!.map((o) => o.value.toUpperCase()));
        for (const v of userVillages) {
          const name = (v.village ?? "").trim();
          if (!name) continue;
          if (dbValues.has(name.toUpperCase())) continue;
          grouped[DropdownType.VILLAGE]!.push({ value: name, label: name });
        }
        grouped[DropdownType.VILLAGE]!.sort((a, b) => a.label.localeCompare(b.label));
      }

      res.json({ items: grouped });
    } catch (e) {
      next(e);
    }
  });

  /** Public read of the admin-managed Policy Group list (no admin permission required). */
  r.get("/policy-groupings", async (_req, res, next) => {
    try {
      const rows = await prisma.policyGroupingOption.findMany({
        orderBy: { name: "asc" },
      });
      res.json({ items: rows });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
