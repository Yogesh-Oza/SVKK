"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailTemplateEditor } from "@/features/svkk-email-templates/email-template-editor";
import { backendApi } from "@/lib/svkk/api";
import { hasPermission } from "@/lib/svkk/permissions";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { Loader2, Mail } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type EmailTemplate = {
  id: string;
  label: string;
  description: string;
  subject: string;
  body: string;
  defaultSubject: string;
  defaultBody: string;
  variables: string[];
};

type TemplateDraft = { subject: string; body: string };

export default function EmailTemplatesPage() {
  const { user } = useSvkkAuth();
  const canEdit = user ? hasPermission(user.permissions, "admin:settings") : false;
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TemplateDraft>>({});

  const load = useCallback(async () => {
    if (!canEdit) return;
    setLoading(true);
    try {
      const { data } = await backendApi.get<{ templates: EmailTemplate[] }>("/email-templates");
      setTemplates(data.templates ?? []);
      const next: Record<string, TemplateDraft> = {};
      for (const t of data.templates ?? []) {
        next[t.id] = { subject: t.subject, body: t.body };
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
      await backendApi.put(`/email-templates/${templateId}`, {
        subject: draft.subject,
        body: draft.body,
      });
      toast.success("Template saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  function resetToDefault(templateId: string) {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    setDrafts((d) => ({
      ...d,
      [templateId]: { subject: t.defaultSubject, body: t.defaultBody },
    }));
    toast.message("Restored default content — click Save to apply.");
  }

  if (!canEdit) {
    return <p className="text-muted-foreground text-sm">You do not have permission to edit email templates.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Email templates</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Edit message content visually — styling and footer are fixed. Use{" "}
          <strong>Insert variable</strong> or <strong>Document link</strong> for dynamic fields. Preview shows
          sample policy data; sent emails use real holder and policy values.
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
            <CardContent>
              <EmailTemplateEditor
                templateId={t.id}
                label={t.label}
                description={t.description}
                variables={t.variables}
                subject={drafts[t.id]?.subject ?? ""}
                body={drafts[t.id]?.body ?? ""}
                saving={savingId === t.id}
                onSubjectChange={(subject) =>
                  setDrafts((d) => ({
                    ...d,
                    [t.id]: { subject, body: d[t.id]?.body ?? "" },
                  }))
                }
                onBodyChange={(body) =>
                  setDrafts((d) => ({
                    ...d,
                    [t.id]: { subject: d[t.id]?.subject ?? "", body },
                  }))
                }
                onSave={() => void save(t.id)}
                onReset={() => resetToDefault(t.id)}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
