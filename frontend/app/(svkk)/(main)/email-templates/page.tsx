"use client";

import { EmailTemplatesWorkspace } from "@/features/svkk-email-templates/email-templates-workspace";
import { backendApi } from "@/lib/svkk/api";
import { isMediclaimTemplateId } from "@/lib/svkk/email-template-layout";
import { hasPermission } from "@/lib/svkk/permissions";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { Loader2 } from "lucide-react";
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
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TemplateDraft>>({});

  const load = useCallback(async () => {
    if (!canEdit) return;
    setLoading(true);
    try {
      const { data } = await backendApi.get<{ templates: EmailTemplate[] }>("/email-templates");
      const list = (data.templates ?? []).filter((t) => isMediclaimTemplateId(t.id));
      setTemplates(list);
      const next: Record<string, TemplateDraft> = {};
      for (const t of list) {
        next[t.id] = { subject: t.subject, body: t.body };
      }
      setDrafts(next);
      setSelectedId((prev) => (list.some((t) => t.id === prev) ? prev : (list[0]?.id ?? "")));
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
          Choose a template from the list, then edit subject and body. TEAM MEDICLAIM header and signature are
          fixed. Use <strong>Insert variable</strong> or <strong>Document link</strong> for dynamic fields.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading templates…
        </p>
      ) : (
        <EmailTemplatesWorkspace
          templates={templates}
          selectedId={selectedId}
          onSelectId={setSelectedId}
          drafts={drafts}
          savingId={savingId}
          onSubjectChange={(id, subject) =>
            setDrafts((d) => ({
              ...d,
              [id]: { subject, body: d[id]?.body ?? "" },
            }))
          }
          onBodyChange={(id, body) =>
            setDrafts((d) => ({
              ...d,
              [id]: { subject: d[id]?.subject ?? "", body },
            }))
          }
          onSave={(id) => void save(id)}
          onReset={resetToDefault}
        />
      )}
    </div>
  );
}
