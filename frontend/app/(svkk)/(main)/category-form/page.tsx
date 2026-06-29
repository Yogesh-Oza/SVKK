"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmailTemplateEditor } from "@/features/svkk-email-templates/email-template-editor";
import { PolicyFilterMulti } from "@/features/svkk-policies/policy-filter-multi";
import { useSvkkAuth } from "@/contexts/svkk-auth-context";
import { backendApi, svkkJson } from "@/lib/svkk/api";
import { hasPermission } from "@/lib/svkk/permissions";
import { ExternalLink, FileText, Loader2, Send, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const TEMPLATE_ID = "category_form";
const TEST_EMAIL_STORAGE_KEY = "svkk-category-form-test-to";

type CategoryFormConfig = {
  label: string;
  description: string;
  subject: string;
  body: string;
  defaultSubject: string;
  defaultBody: string;
  variables: string[];
  pdf: {
    fileId: string | null;
    fileName: string | null;
    webUrl: string | null;
  };
};

type CategoryItem = { id: string; key: string; name: string };

type PreviewCounts = {
  policyCount: number;
  emailableCount: number;
  skippedCount: number;
};

export default function CategoryFormPage() {
  const { user } = useSvkkAuth();
  const canEdit = user ? hasPermission(user.permissions, "admin:settings") : false;

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<CategoryFormConfig | null>(null);
  const [draft, setDraft] = useState({ subject: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [removingPdf, setRemovingPdf] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewCounts | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(TEST_EMAIL_STORAGE_KEY)?.trim();
    if (stored) {
      setTestEmail(stored);
      return;
    }
    if (user?.email) setTestEmail(user.email);
  }, [user?.email]);

  const load = useCallback(async () => {
    if (!canEdit) return;
    setLoading(true);
    try {
      const [formRes, catRes] = await Promise.all([
        backendApi.get<CategoryFormConfig>("/category-form"),
        svkkJson<{ items: CategoryItem[] }>("/categories"),
      ]);
      const data = formRes.data;
      setConfig(data);
      setDraft({ subject: data.subject, body: data.body });
      setCategories(catRes.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load category form");
    } finally {
      setLoading(false);
    }
  }, [canEdit]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryOptions = useMemo(
    () =>
      categories
        .map((c) => ({ value: c.id, label: `${c.name} (${c.key})` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories],
  );

  const refreshPreview = useCallback(async (categoryIds: string[]) => {
    if (!categoryIds.length) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const { data } = await backendApi.post<PreviewCounts>("/category-form/preview", {
        categoryIds,
      });
      setPreview(data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshPreview(selectedCategoryIds);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [selectedCategoryIds, refreshPreview]);

  async function saveTemplate() {
    setSaving(true);
    try {
      await backendApi.put("/category-form", draft);
      toast.success("Category form template saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function resetToDefault() {
    if (!config) return;
    setDraft({ subject: config.defaultSubject, body: config.defaultBody });
    toast.message("Restored default content — click Save template to apply.");
  }

  function handleTestEmailChange(email: string) {
    setTestEmail(email);
    try {
      window.localStorage.setItem(TEST_EMAIL_STORAGE_KEY, email.trim());
    } catch {
      /* ignore */
    }
  }

  async function sendTest() {
    const to = testEmail.trim();
    if (!to) return;
    setSendingTest(true);
    try {
      await backendApi.post("/category-form/send-test", { to, ...draft });
      toast.success(`Test email sent to ${to}`);
    } catch (e) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "")
          : "";
      toast.error(msg || (e instanceof Error ? e.message : "Failed to send test email"));
    } finally {
      setSendingTest(false);
    }
  }

  async function uploadPdf(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      toast.error("Only PDF files are allowed.");
      return;
    }
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await backendApi.post<{
        fileId: string;
        fileName: string;
        webUrl: string;
      }>("/category-form/pdf", fd);
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              pdf: { fileId: data.fileId, fileName: data.fileName, webUrl: data.webUrl },
            }
          : prev,
      );
      toast.success("Category form PDF uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF upload failed");
    } finally {
      setUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  }

  async function removePdf() {
    setRemovingPdf(true);
    try {
      await backendApi.delete("/category-form/pdf");
      setConfig((prev) =>
        prev ? { ...prev, pdf: { fileId: null, fileName: null, webUrl: null } } : prev,
      );
      toast.success("PDF removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove PDF");
    } finally {
      setRemovingPdf(false);
    }
  }

  async function confirmSend() {
    if (!selectedCategoryIds.length) {
      toast.error("Select at least one category.");
      return;
    }
    setSending(true);
    try {
      const { data } = await backendApi.post<{ sent: number; skipped: number; failed: number }>(
        "/category-form/send",
        { categoryIds: selectedCategoryIds, ...draft },
      );
      toast.success(
        `Sent ${data.sent} email${data.sent === 1 ? "" : "s"}. Skipped ${data.skipped}, failed ${data.failed}.`,
      );
      setSendOpen(false);
    } catch (e) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "")
          : "";
      toast.error(msg || (e instanceof Error ? e.message : "Send failed"));
    } finally {
      setSending(false);
    }
  }

  if (!canEdit) {
    return (
      <p className="text-muted-foreground text-sm">You do not have permission to manage the category form.</p>
    );
  }

  if (loading || !config) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading category form…
      </p>
    );
  }

  const hasPdf = Boolean(config.pdf.fileId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Category form</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Configure the email sent to policy holders in selected categories. TEAM MEDICLAIM header and signature are
          fixed. Upload one PDF to attach to every send. Use <strong>Insert variable</strong> for dynamic fields.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category form PDF</CardTitle>
          <CardDescription>
            One shared PDF attached to every category form email (test and production sends).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPdf(file);
            }}
          />
          {hasPdf ? (
            <>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <FileText className="text-muted-foreground size-4 shrink-0" />
                <span className="truncate font-medium">{config.pdf.fileName ?? "category-form.pdf"}</span>
                {config.pdf.webUrl ? (
                  <a
                    href={config.pdf.webUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                  >
                    Open <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingPdf}
                onClick={() => pdfInputRef.current?.click()}
              >
                {uploadingPdf ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                Replace PDF
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={removingPdf}
                onClick={() => void removePdf()}
              >
                {removingPdf ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
                Remove
              </Button>
            </>
          ) : (
            <Button type="button" disabled={uploadingPdf} onClick={() => pdfInputRef.current?.click()}>
              {uploadingPdf ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
              Upload PDF to OneDrive
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send by category</CardTitle>
          <CardDescription>
            Select one or more categories. One personalized email is sent per policy to the holder&apos;s email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <PolicyFilterMulti
            label="Categories"
            placeholder="Select categories"
            options={categoryOptions}
            selected={selectedCategoryIds}
            onChange={setSelectedCategoryIds}
            accentClassName="border-violet-200/90 from-violet-50/95 to-card dark:border-violet-900/50 dark:from-violet-950/35 dark:to-card"
            popoverContentClassName="max-h-[min(22rem,70vh)]"
          />
          {previewLoading ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Counting recipients…
            </p>
          ) : preview && selectedCategoryIds.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              <span className="text-foreground font-medium">{preview.policyCount}</span> polic
              {preview.policyCount === 1 ? "y" : "ies"} in selected categories —{" "}
              <span className="text-foreground font-medium">{preview.emailableCount}</span> will receive email,{" "}
              <span className="text-foreground font-medium">{preview.skippedCount}</span> skipped (no valid email).
            </p>
          ) : null}
          <Button
            type="button"
            disabled={!selectedCategoryIds.length || !hasPdf || sending}
            onClick={() => setSendOpen(true)}
          >
            <Send className="mr-2 size-4" />
            Send to selected categories
          </Button>
          {!hasPdf ? (
            <p className="text-muted-foreground text-xs">Upload a category form PDF before sending.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{config.label}</CardTitle>
          <CardDescription>{config.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailTemplateEditor
            templateId={TEMPLATE_ID}
            label={config.label}
            description={config.description}
            variables={config.variables}
            subject={draft.subject}
            body={draft.body}
            saving={saving}
            onSubjectChange={(subject) => setDraft((d) => ({ ...d, subject }))}
            onBodyChange={(body) => setDraft((d) => ({ ...d, body }))}
            onSave={() => void saveTemplate()}
            onReset={resetToDefault}
            testEmail={testEmail}
            onTestEmailChange={handleTestEmailChange}
            sendingTest={sendingTest}
            onSendTest={() => void sendTest()}
          />
        </CardContent>
      </Card>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send category form emails</DialogTitle>
            <DialogDescription>
              This will send one email per policy in the selected categories with the current subject, body, and
              attached PDF. Unsaved template edits in this page will be used.
            </DialogDescription>
          </DialogHeader>
          {preview ? (
            <p className="text-sm">
              Ready to send to <strong>{preview.emailableCount}</strong> holder
              {preview.emailableCount === 1 ? "" : "s"} ({preview.skippedCount} skipped).
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSendOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmSend()} disabled={sending}>
              {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
              Confirm send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
