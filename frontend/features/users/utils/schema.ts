import { z } from "zod";

export const userSchema = z.object({
  id: z.string().min(1, "Id is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  image: z.string().nullable().optional(),
  roleId: z.string().min(1),
  roleName: z.string().optional(),
  roleSlug: z.string().optional(),
  createdAt: z.coerce.date(),
});

export const createUserFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleId: z.string().min(1, "Select a role"),
});

export const editUserFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  roleId: z.string().min(1, "Select a role"),
  password: z
    .string()
    .optional()
    .refine((val) => !val || val.length >= 8, "Password must be at least 8 characters"),
});

export type User = z.infer<typeof userSchema>;
export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;
export type EditUserFormValues = z.infer<typeof editUserFormSchema>;
