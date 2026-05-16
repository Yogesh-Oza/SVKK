"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api/svkk-client";
import {
  createUserFormSchema,
  editUserFormSchema,
  type CreateUserFormValues,
  type EditUserFormValues,
  type User,
} from "../utils/schema";
import { getSvkkErrorMessage } from "../utils/api-error";

interface UserFormDialogProps {
  user?: User | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

export function UserFormDialog({
  user,
  open: controlledOpen,
  onOpenChange,
  onSuccess,
  trigger,
}: UserFormDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignableRoles, setAssignableRoles] = useState<
    { id: string; name: string; slug: string }[]
  >([]);

  const isEdit = !!user;
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  useEffect(() => {
    if (!open) return;
    void apiGet<{ roles: { id: string; name: string; slug: string }[] }>(
      "/rbac/roles/assignable",
    )
      .then((json) => setAssignableRoles(json.roles ?? []))
      .catch(() => setAssignableRoles([]));
  }, [open]);

  const createForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      roleId: "",
    },
  });

  const editForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
      name: "",
      email: "",
      roleId: "",
      password: "",
    },
  });

  useEffect(() => {
    if (user && open) {
      editForm.reset({
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        password: "",
      });
    }
  }, [user, open, editForm]);

  async function handleCreate(data: CreateUserFormValues) {
    setIsSubmitting(true);
    try {
      await apiPost("/users", {
        name: data.name,
        email: data.email,
        password: data.password,
        roleId: data.roleId,
      });
      toast.success("User created successfully");
      createForm.reset();
      setOpen(false);
      onSuccess?.();
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Failed to create user"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEdit(data: EditUserFormValues) {
    if (!user) return;
    setIsSubmitting(true);
    try {
      await apiPatch(`/users/${encodeURIComponent(user.id)}`, {
        name: data.name,
        email: data.email,
        roleId: data.roleId,
        ...(data.password && data.password.length >= 8
          ? { password: data.password }
          : {}),
      });
      toast.success("User updated successfully");
      setOpen(false);
      onSuccess?.();
    } catch (e) {
      toast.error(getSvkkErrorMessage(e, "Failed to update user"));
    } finally {
      setIsSubmitting(false);
    }
  }

  const formContent = isEdit ? (
    <Form {...editForm}>
      <form
        onSubmit={editForm.handleSubmit(handleEdit)}
        className="space-y-4"
      >
        <FormField
          control={editForm.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter full name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={editForm.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="Enter email address"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={editForm.control}
          name="roleId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger className="cursor-pointer w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={editForm.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Password (optional)</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Leave blank to keep current"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="submit"
            className="cursor-pointer"
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </form>
    </Form>
  ) : (
    <Form {...createForm}>
      <form
        onSubmit={createForm.handleSubmit(handleCreate)}
        className="space-y-4"
      >
        <FormField
          control={createForm.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter full name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={createForm.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="Enter email address"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={createForm.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="Minimum 8 characters"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={createForm.control}
          name="roleId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger className="cursor-pointer w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button
            type="submit"
            className="cursor-pointer"
            disabled={isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Create User
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );

  const dialogTrigger =
    !isEdit &&
    trigger && (
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {dialogTrigger}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Add New User"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update user details. Leave password blank to keep the current one."
              : "Create a new user account. They will be able to sign in with the email and password you provide."}
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
