"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { backendApi } from "@/lib/svkk/api";
import { hasPermission } from "@/lib/svkk/permissions";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { Loader2, Mail, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type EmailTemplate = {
  id: string;
  label: string;
  description: string;
  subject: string;
  html: string;
  variables: string[];
};

export default function EmailTemplatesPage() {
  const { user } = useSvkkAuth();
  const canEdit = user ? hasPermission(user.permissions, "admin:settings") : false;
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { subject: string; html: string }>>({});

  const load = useCallback(async () => {
    if (!canEdit) return;
    setLoading(true);
    try {
      const { data } = await backendApi.get<{ templates: EmailTemplate[] }>("/email-templates");
      setTemplates(data.templates ?? []);
      const next: Record<string, { subject: string; html: string }> = {};
      for (const t of data.templates ?? []) {
        next[t.id] = { subject: t.subject, html: t.html };
      }
      setDrafts(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [canEdit]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(templateId: string) {
    const draft = drafts[templateId];
    if (!draft) return;
    setSavingId(templateId);
    try {
      await backendApi.put(`/email-templates/${templateId}`, draft);
      toast.success("Template saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  if (!canEdit) {
    return <p className="text-muted-foreground text-sm">You do not have permission to edit email templates.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email templates</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Customize HTML emails for policy creation, policy number and document updates, and renewal
          reminders (2 months, 1 month, 8 days, and 2 days before end date). Use placeholders like{" "}
          <code className="text-xs">{"{{holderName}}"}</code>, <code className="text-xs">{"{{policyNo}}"}</code>,{" "}
          <code className="text-xs">{"{{documentUrl}}"}</code>,{" "}
          <code className="text-xs">{"{{policyUrl}}"}</code> (Policy URL from the policy form), and{" "}
          <code className="text-xs">{"{{policyDocumentLink}}"}</code> (button or fallback text).
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading templates…
        </p>
      ) : (
        templates.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="size-5" />
                {t.label}
              </CardTitle>
              <CardDescription>{t.description}</CardDescription>
              <p className="text-muted-foreground text-xs">
                Variables: {t.variables.map((v) => `{{${v}}}`).join(", ")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`${t.id}-subject`}>Subject</Label>
                <Input
                  id={`${t.id}-subject`}
                  value={drafts[t.id]?.subject ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [t.id]: { ...d[t.id]!, subject: e.target.value, html: d[t.id]?.html ?? "" },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${t.id}-html`}>HTML body</Label>
                <Textarea
                  id={`${t.id}-html`}
                  className="min-h-[220px] font-mono text-xs"
                  value={drafts[t.id]?.html ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [t.id]: { subject: d[t.id]?.subject ?? "", html: e.target.value },
                    }))
                  }
                />
              </div>
              <Button
                type="button"
                className="cursor-pointer"
                disabled={savingId === t.id}
                onClick={() => void save(t.id)}
              >
                {savingId === t.id ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                Save template
              </Button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
