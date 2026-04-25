import { z } from "zod";
import type { SvkkRole } from "@/lib/svkk/permissions";
import { SVKK_ROLE_LABELS } from "@/lib/svkk/role-labels";

export { SVKK_ROLE_LABELS };

/** Matches Prisma `UserRole` on the SVKK API. */
export const svkkUserRoles = ["USER", "SUPERVISOR", "ADMIN", "SUPER_ADMIN"] as const;
export type SvkkUserRole = SvkkRole;

export const userSchema = z.object({
  id: z.string().min(1, "Id is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  image: z.string().nullable().optional(),
  role: z.enum(svkkUserRoles),
  createdAt: z.coerce.date(),
});

export const createUserFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(svkkUserRoles),
});

export const editUserFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  role: z.enum(svkkUserRoles),
  password: z
    .string()
    .optional()
    .refine((val) => !val || val.length >= 8, "Password must be at least 8 characters"),
});

export type User = z.infer<typeof userSchema>;
export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;
export type EditUserFormValues = z.infer<typeof editUserFormSchema>;
