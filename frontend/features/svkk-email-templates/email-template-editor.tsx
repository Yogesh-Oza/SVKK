"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildPreviewHtml, isMediclaimTemplateId } from "@/lib/svkk/email-template-layout";
import { Bold, Link2, Loader2, Mail, RotateCcw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type EmailTemplateEditorProps = {
  templateId: string;
  label: string;
  description: string;
  variables: string[];
  subject: string;
  body: string;
  saving: boolean;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (body: string) => void;
  onSave: () => void;
  onReset?: () => void;
  testEmail: string;
  onTestEmailChange: (email: string) => void;
  sendingTest: boolean;
  onSendTest: () => void;
};

function insertAtCursor(el: HTMLElement, html: string) {
  el.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    el.insertAdjacentHTML("beforeend", html);
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const frag = range.createContextualFragment(html);
  range.insertNode(frag);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function EmailTemplateEditor({
  templateId,
  label,
  description,
  variables,
  subject,
  body,
  saving,
  onSubjectChange,
  onBodyChange,
  onSave,
  onReset,
  testEmail,
  onTestEmailChange,
  sendingTest,
  onSendTest,
}: EmailTemplateEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const mediclaim = isMediclaimTemplateId(templateId);
  const preview = useMemo(
    () => buildPreviewHtml(body, subject, templateId),
    [body, subject, templateId],
  );

  const syncBodyFromEditor = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    // Radix unmounts/hides the edit panel on tab switch; blur can fire with empty DOM.
    if (!html.trim() && body.trim()) return;
    onBodyChange(html);
  }, [onBodyChange, body]);

  const handleTabChange = useCallback(
    (next: "edit" | "preview") => {
      if (tab === "edit" && editorRef.current) {
        const html = editorRef.current.innerHTML;
        if (html.trim()) {
          onBodyChange(html);
        }
      }
      setTab(next);
    },
    [tab, onBodyChange],
  );

  useEffect(() => {
    setTab("edit");
  }, [templateId]);

  useEffect(() => {
    if (tab !== "edit" || !editorRef.current) return;
    const el = editorRef.current;
    if (body.trim() && !el.innerHTML.trim()) {
      el.innerHTML = body;
      return;
    }
    if (el.innerHTML !== body) {
      el.innerHTML = body;
    }
  }, [body, tab, templateId]);

  function insertVariable(name: string) {
    if (!editorRef.current) return;
    insertAtCursor(editorRef.current, `{{${name}}}`);
    syncBodyFromEditor();
  }

  function insertDocumentLink() {
    if (!editorRef.current) return;
    insertAtCursor(editorRef.current, "{{policyDocumentLink}}");
    syncBodyFromEditor();
  }

  function insertReceiptFields() {
    if (!editorRef.current) return;
    insertAtCursor(editorRef.current, "{{receiptFields}}");
    syncBodyFromEditor();
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${templateId}-subject`}>Subject</Label>
        <Input
          id={`${templateId}-subject`}
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Email subject — use {{placeholders}}"
        />
        <p className="text-muted-foreground text-xs">
          Preview: <span className="font-medium text-foreground">{preview.subject || "—"}</span>
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => handleTabChange(v as "edit" | "preview")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="edit">Edit content</TabsTrigger>
            <TabsTrigger value="preview">Preview email</TabsTrigger>
          </TabsList>
          {tab === "edit" ? (
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 cursor-pointer"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  document.execCommand("bold");
                  syncBodyFromEditor();
                }}
              >
                <Bold className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 cursor-pointer"
                onMouseDown={(e) => e.preventDefault()}
                onClick={insertDocumentLink}
              >
                <Link2 className="mr-1 size-3.5" />
                Document link
              </Button>
              {mediclaim ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 cursor-pointer"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={insertReceiptFields}
                >
                  Receipt block
                </Button>
              ) : null}
              <Select onValueChange={insertVariable}>
                <SelectTrigger className="h-8 w-[160px] cursor-pointer text-xs">
                  <SelectValue placeholder="Insert variable" />
                </SelectTrigger>
                <SelectContent>
                  {variables.map((v) => (
                    <SelectItem key={v} value={v} className="cursor-pointer text-xs">
                      {`{{${v}}}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <TabsContent value="edit" forceMount className="mt-3 space-y-2 data-[state=inactive]:hidden">
          <p className="text-muted-foreground text-xs">
            {mediclaim
              ? "Mediclaim layout: branded header and TEAM MEDICLAIM signature are fixed. Edit the message and use Insert variable for dynamic fields."
              : "Edit the message below. Layout, fonts, and footer are fixed — only this content is saved. Use Document link for the Policy URL button."}
          </p>
          <div className="rounded-xl border bg-[#eef2f7] p-4">
            <div
              className={`email-template-editor-card mx-auto max-w-[600px] rounded-xl border border-[#d9e3ee] bg-white p-6 text-[#0b1728] shadow-sm [&_.alert-box]:my-3 [&_.btn]:inline-block [&_.btn]:mt-3 [&_.btn]:rounded-lg [&_.btn]:bg-[#174ea6] [&_.btn]:px-[18px] [&_.btn]:py-2.5 [&_.btn]:text-sm [&_.btn]:text-white [&_.btn]:no-underline [&_.policy-block]:my-3 [&_.receipt-box]:my-3 [&_h1]:mb-3 [&_h1]:text-lg [&_h1]:font-semibold [&_p]:my-2 [&_p]:leading-relaxed`}
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncBodyFromEditor}
              onBlur={syncBodyFromEditor}
              role="textbox"
              aria-label={`${label} email body`}
            />
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-3">
          <p className="text-muted-foreground mb-2 text-xs">
            Sample data is shown for placeholders. Real emails use each policy&apos;s values.
          </p>
          <div
            className={`overflow-hidden rounded-xl border ${mediclaim ? "bg-[#eef2f7]" : "bg-[#f4f7fb]"}`}
          >
            <iframe
              title={`Preview: ${label}`}
              className={`min-h-[480px] w-full border-0 ${mediclaim ? "bg-[#eef2f7]" : "bg-[#f4f7fb]"}`}
              sandbox=""
              srcDoc={preview.html}
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Send test email</p>
          <p className="text-muted-foreground text-xs">
            Sends the current subject and body (including unsaved edits) with sample placeholder data — same as
            Preview email.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={`${templateId}-test-email`}>Send to</Label>
            <Input
              id={`${templateId}-test-email`}
              type="email"
              value={testEmail}
              onChange={(e) => onTestEmailChange(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 cursor-pointer"
            disabled={sendingTest || !testEmail.trim()}
            onClick={onSendTest}
          >
            {sendingTest ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Mail className="mr-2 size-4" />
            )}
            Send test mail
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="cursor-pointer" disabled={saving} onClick={onSave}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          Save template
        </Button>
        {onReset ? (
          <Button type="button" variant="outline" className="cursor-pointer" disabled={saving} onClick={onReset}>
            <RotateCcw className="mr-2 size-4" />
            Reset to default
          </Button>
        ) : null}
      </div>
    </div>
  );
}
