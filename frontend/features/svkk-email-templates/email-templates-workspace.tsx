"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmailTemplateEditor } from "@/features/svkk-email-templates/email-template-editor";
import { cn } from "@/lib/utils";
import { Mail } from "lucide-react";
import { useEffect, useMemo } from "react";

export type EmailTemplateItem = {
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

const TEMPLATE_GROUPS: { label: string; ids: string[] }[] = [
  { label: "Policy Updates", ids: ["policy_number_updated"] },
  { label: "Renewal reminders", ids: ["renewal_60", "renewal_30", "renewal_8", "renewal_2"] },
  {
    label: "Acknowledgements",
    ids: ["mediclaim_new_policy_ack", "mediclaim_renewal_ack"],
  },
  {
    label: "Payment & status",
    ids: ["mediclaim_dishonoured", "mediclaim_premium_reminder", "mediclaim_cheque_honoured"],
  },
];

function groupTemplates(templates: EmailTemplateItem[]): { label: string; items: EmailTemplateItem[] }[] {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const used = new Set<string>();
  const groups: { label: string; items: EmailTemplateItem[] }[] = [];

  for (const g of TEMPLATE_GROUPS) {
    const items = g.ids.map((id) => byId.get(id)).filter((t): t is EmailTemplateItem => !!t);
    if (items.length) {
      groups.push({ label: g.label, items });
      for (const t of items) used.add(t.id);
    }
  }

  const rest = templates.filter((t) => !used.has(t.id));
  if (rest.length) groups.push({ label: "Other", items: rest });

  return groups;
}

type EmailTemplatesWorkspaceProps = {
  templates: EmailTemplateItem[];
  selectedId: string;
  onSelectId: (id: string) => void;
  drafts: Record<string, TemplateDraft>;
  savingId: string | null;
  onSubjectChange: (id: string, subject: string) => void;
  onBodyChange: (id: string, body: string) => void;
  onSave: (id: string) => void;
  onReset: (id: string) => void;
};

export function EmailTemplatesWorkspace({
  templates,
  selectedId,
  onSelectId,
  drafts,
  savingId,
  onSubjectChange,
  onBodyChange,
  onSave,
  onReset,
}: EmailTemplatesWorkspaceProps) {
  const groups = useMemo(() => groupTemplates(templates), [templates]);
  const active = templates.find((t) => t.id === selectedId) ?? templates[0];

  useEffect(() => {
    if (!templates.length) return;
    if (!templates.some((t) => t.id === selectedId)) {
      onSelectId(templates[0]!.id);
    }
  }, [templates, selectedId, onSelectId]);

  if (!templates.length) {
    return <p className="text-muted-foreground text-sm">No email templates found.</p>;
  }

  if (!active) return null;

  const draft = drafts[active.id] ?? { subject: active.subject, body: active.body };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="lg:hidden">
        <Select value={active.id} onValueChange={onSelectId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose template" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectGroup key={g.label}>
                <SelectLabel>{g.label}</SelectLabel>
                {g.items.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <aside className="hidden shrink-0 lg:block lg:w-72">
        <div className="rounded-lg border bg-card">
          <div className="border-b px-3 py-2.5">
            <p className="text-sm font-medium">Templates</p>
            <p className="text-muted-foreground text-xs">{templates.length} messages</p>
          </div>
          <ScrollArea className="h-[min(70vh,calc(100dvh-11rem))]">
            <nav className="p-2">
              {groups.map((g) => (
                <div key={g.label} className="mb-3 last:mb-0">
                  <p className="text-muted-foreground px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
                    {g.label}
                  </p>
                  <ul className="space-y-0.5">
                    {g.items.map((t) => (
                      <li key={t.id}>
                        <Button
                          type="button"
                          variant="ghost"
                          className={cn(
                            "h-auto w-full justify-start px-2 py-2 text-left font-normal",
                            t.id === active.id && "bg-accent text-accent-foreground",
                          )}
                          onClick={() => onSelectId(t.id)}
                        >
                          <span className="line-clamp-2 text-sm leading-snug">{t.label}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </ScrollArea>
        </div>
      </aside>

      <Card className="min-w-0 flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-5 shrink-0" />
            {active.label}
          </CardTitle>
          <CardDescription>{active.description}</CardDescription>
          <p className="text-muted-foreground text-xs">
            Variables: {active.variables.map((v) => `{{${v}}}`).join(", ")}
          </p>
        </CardHeader>
        <CardContent>
          <EmailTemplateEditor
            key={active.id}
            templateId={active.id}
            label={active.label}
            description={active.description}
            variables={active.variables}
            subject={draft.subject}
            body={draft.body}
            saving={savingId === active.id}
            onSubjectChange={(subject) => onSubjectChange(active.id, subject)}
            onBodyChange={(body) => onBodyChange(active.id, body)}
            onSave={() => onSave(active.id)}
            onReset={() => onReset(active.id)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
