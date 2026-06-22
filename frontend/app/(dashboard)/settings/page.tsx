"use client";

import { ContentSection } from "@/components/content-section";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { apiGet, apiPatch } from "@/lib/svkk/api";
import { setSessionUser } from "@/lib/store/slices/auth-slice";
import { useAppDispatch } from "@/lib/store/hooks";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { SvkkUser } from "@/lib/svkk/types";

const profileFormSchema = z
  .object({
    name: z
      .string()
      .min(2, { message: "Name must be at least 2 characters." })
      .max(100, { message: "Name must not be longer than 100 characters." }),
    email: z.string().email({ message: "Please enter a valid email address." }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters." })
      .optional()
      .or(z.literal("")),
    confirmPassword: z.string().optional().or(z.literal("")),
  })
  .refine((data) => data.password === "" || data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ProfileFormValues = z.infer<typeof profileFormSchema>;

function mapMeToForm(user: { name: string; email: string }): ProfileFormValues {
  return {
    name: user.name,
    email: user.email,
    password: "",
    confirmPassword: "",
  };
}

export default function SettingsProfilePage() {
  const dispatch = useAppDispatch();
  const { user: crmUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onChange",
  });

  const { reset } = form;

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      try {
        const me = await apiGet<SvkkUser>("/auth/me");
        if (cancelled) return;
        reset(mapMeToForm(me));
        dispatch(setSessionUser(me));
      } catch {
        if (cancelled) return;
        if (crmUser) {
          reset(mapMeToForm({ name: crmUser.name, email: crmUser.email }));
        } else {
          reset();
        }
        toast.error("Could not load profile from the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
    // Load profile once when the page mounts — avoid unstable `form` / auth deps (infinite /auth/me loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(values: ProfileFormValues) {
    setSubmitting(true);
    try {
      const body: { name: string; email: string; password?: string } = {
        name: values.name,
        email: values.email,
      };
      if (values.password && values.password.length >= 8) {
        body.password = values.password;
      }
      const { user } = await apiPatch<{ user: SvkkUser }>("/auth/me", body);
      form.reset({
        name: user.name,
        email: user.email,
        password: "",
        confirmPassword: "",
      });
      dispatch(setSessionUser(user));
      toast.success("Profile updated successfully.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update profile";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <ContentSection title="Profile" desc="Update your account information.">
        <div className="space-y-4 animate-pulse">
          <div className="h-10 rounded-md bg-muted" />
          <div className="h-10 rounded-md bg-muted" />
          <div className="h-10 w-24 rounded-md bg-muted" />
        </div>
      </ContentSection>
    );
  }

  return (
    <ContentSection
      title="Profile"
      desc="Update your account information. Changes are saved to your user account on the server."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pb-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Your name</FormLabel>
                <FormControl>
                  <Input placeholder="Your name" autoComplete="name" {...field} />
                </FormControl>
                <FormDescription>
                  This is the name shown in the app and in emails.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="you@organization.com"
                    autoComplete="email"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Your email address for signing in and notifications.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Leave blank to keep current"
                    autoComplete="new-password"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Only enter a new password if you want to change it (min 8 characters).
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Update profile"}
          </Button>
        </form>
      </Form>
    </ContentSection>
  );
}
