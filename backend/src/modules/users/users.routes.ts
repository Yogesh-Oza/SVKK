import { Router } from "express";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import type { Env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/require-auth.js";
import { requirePermission } from "../../middlewares/rbac.js";
import {
  assertCanDeleteUser,
  createUser,
  deleteUser,
  listUsers,
  updateUser,
} from "./users.service.js";

export function createUsersRouter(_env: Env) {
  const r = Router();
  r.use(requireAuth(_env));
  r.use(requirePermission("users:manage"));

  r.get("/", async (_req, res, next) => {
    try {
      const users = await listUsers();
      res.json({ users });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", async (req, res, next) => {
    try {
      const body = z
        .object({
          email: z.string().email(),
          name: z.string().min(2).max(100),
          password: z.string().min(8),
          role: z.nativeEnum(UserRole),
        })
        .parse(req.body);

      const user = await createUser(body);
      res.status(201).json({ user });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", async (req, res, next) => {
    try {
      const id = z.string().min(1).parse(req.params.id);
      const body = z
        .object({
          name: z.string().min(2).max(100).optional(),
          email: z.string().email().optional(),
          password: z.string().min(8).optional().or(z.literal("")),
          role: z.nativeEnum(UserRole).optional(),
        })
        .refine(
          (b) =>
            b.name != null ||
            b.email != null ||
            (b.password != null && b.password.length > 0) ||
            b.role != null,
          { message: "At least one field is required" },
        )
        .parse(req.body);

      const password =
        body.password && body.password.length > 0 ? body.password : undefined;
      const user = await updateUser(id, {
        name: body.name,
        email: body.email,
        password,
        role: body.role,
      });
      res.json({ user });
    } catch (e) {
      next(e);
    }
  });

  r.delete("/:id", async (req, res, next) => {
    try {
      const id = z.string().min(1).parse(req.params.id);
      await assertCanDeleteUser(req.userId!, id);
      await deleteUser(id);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
