"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Loader2,
  PlusCircle,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

import {
  fetchPremiumSnapshot,
  fileToChartRows,
  normPolicyKey,
  savePremiumSnapshot,
  type ChartBand,
  type ChartData,
  type DiscountConfig,
  type PolicyDef,
  type PolicyKey,
  type PremiumState,
} from "@/lib/svkk/premium";
import { svkkJson } from "@/lib/svkk/api";

type SavedChartDetail = {
  id: string;
  policyTypeId: string;
  version: number;
  effectiveFrom: string;
  chartKind: "COMBINED" | "HOLDER" | "MEMBER";
  siColumns: number[];
  bands: ChartBand[];
};

type PolicyTypeRefRow = {
  id: string;
  key: string;
  name: string;
  chartMode: string;
  description: string | null;
};

type AdminNew = {
  key: string;
  label: string;
  description: string;
  mode: "same" | "different";
  discountType: "count" | "daughter" | "different";
};

const EMPTY_NEW: AdminNew = {
  key: "",
  label: "",
  description: "",
  mode: "same",
  discountType: "count",
};

/**
 * Sample CSVs admins can download to learn the expected shape.
 * Column 1 is age (single number, or "min-max"). Remaining headers are SI
 * values; cells are premiums in INR. Parser is in `lib/svkk/premium/csv.ts`.
 */
const SAMPLE_COMMON_CSV = `Age,300000,500000,1000000
0-17,1800,2800,4900
18-35,2400,3500,6200
36-45,3400,4900,8600
46-60,4700,6900,11800
61-100,7600,10800,17300
`;

const SAMPLE_HOLDER_CSV = `Age,300000,500000,1000000
18-35,2800,4100,7200
36-45,3900,5700,9800
46-60,5600,8100,13700
61-100,8900,12500,19800
`;

const SAMPLE_MEMBER_CSV = `Age,300000,500000,1000000
0-17,1500,2300,4100
18-35,2100,3100,5600
36-45,3100,4500,7900
46-60,4500,6500,11100
61-100,7100,10100,16400
`;

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CalculatorAdminPage() {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<PremiumState>({ defs: {}, charts: {} });
  /** Last server-known snapshot. Compared with `state` to derive dirty-ness. */
  const [serverState, setServerState] = useState<PremiumState>({ defs: {}, charts: {} });
  const [policyTypeIdByKey, setPolicyTypeIdByKey] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"charts" | "discounts">("charts");
  const [policy, setPolicy] = useState<PolicyKey>("asha_kiran");
  const [newPolicy, setNewPolicy] = useState<AdminNew>(EMPTY_NEW);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "ok" | "err"; text: string }>({
    tone: "info",
    text: "Policy charts and discount settings are ready for configuration.",
  });
  const [savedCharts, setSavedCharts] = useState<SavedChartDetail[] | null>(null);
  const [savedChartsLoading, setSavedChartsLoading] = useState(false);
  const [savedChartsErr, setSavedChartsErr] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const types = await svkkJson<PolicyTypeRefRow[]>("/calculation/reference/policy-types");
        if (cancelled) return;
        setPolicyTypeIdByKey(
          Object.fromEntries(types.map((t) => [t.key, t.id])),
        );
        const next = await fetchPremiumSnapshot();
        if (cancelled) return;
        setState(next);
        setServerState(structuredClone(next));
        const first = Object.keys(next.defs)[0];
        if (first && !next.defs[policy]) setPolicy(first);
      } catch (e) {
        if (!cancelled)
          setMsg({
            tone: "err",
            text: `Failed to load: ${e instanceof Error ? e.message : String(e)}`,
          });
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(serverState),
    [state, serverState],
  );

  // Mutators just update local state — nothing hits the network until Save.
  const persistDefs = (next: Record<string, PolicyDef>) => {
    setState((s) => ({ ...s, defs: next }));
  };
  const persistCharts = (next: Record<string, ChartData>) => {
    setState((s) => ({ ...s, charts: next }));
  };

  async function onSave() {
    setSaving(true);
    setMsg({ tone: "info", text: "Saving…" });
    try {
      await savePremiumSnapshot(state);
      // Re-fetch so server-generated ids and any normalized values are reflected.
      const types = await svkkJson<PolicyTypeRefRow[]>("/calculation/reference/policy-types");
      setPolicyTypeIdByKey(Object.fromEntries(types.map((t) => [t.key, t.id])));
      const fresh = await fetchPremiumSnapshot();
      setState(fresh);
      setServerState(structuredClone(fresh));
      setMsg({ tone: "ok", text: "Saved." });
    } catch (e) {
      setMsg({
        tone: "err",
        text: `Save failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setSaving(false);
    }
  }

  function onDiscard() {
    setState(structuredClone(serverState));
    setMsg({ tone: "info", text: "Reverted to last saved." });
  }

  const def = state.defs[policy];
  const chart = state.charts[policy];
  const mode: "same" | "different" = def?.mode ?? "same";
  const policyTypeId = policyTypeIdByKey[policy] ?? "";

  async function loadSavedCharts() {
    if (!policyTypeId) {
      setSavedCharts([]);
      return;
    }
    setSavedChartsLoading(true);
    setSavedChartsErr("");
    try {
      const rows = await svkkJson<SavedChartDetail[]>(
        `/calculation/admin/chart-details?policyTypeId=${encodeURIComponent(policyTypeId)}`,
      );
      setSavedCharts(rows);
    } catch (e) {
      setSavedChartsErr(e instanceof Error ? e.message : String(e));
      setSavedCharts(null);
    } finally {
      setSavedChartsLoading(false);
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    void loadSavedCharts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, policyTypeId]);

  const summaries: { title: string; rows: ChartBand[]; kind: "common" | "holder" | "member" }[] =
    Array.isArray(chart)
      ? [{ title: "Common chart", rows: chart, kind: "common" }]
      : [
          { title: "Holder chart", rows: chart?.holder ?? [], kind: "holder" },
          { title: "Member chart", rows: chart?.member ?? [], kind: "member" },
        ];

  function addPolicyType() {
    const rawKey = String(newPolicy.key || newPolicy.label || "").trim();
    const key = normPolicyKey(rawKey);
    if (!key) {
      setMsg({ tone: "err", text: "Please enter a policy name or key." });
      return;
    }
    if (state.defs[key]) {
      setMsg({ tone: "err", text: `Policy type already exists: ${state.defs[key]?.label ?? key}` });
      return;
    }
    const label = (newPolicy.label || rawKey).trim() || rawKey;
    const description = newPolicy.description.trim() || "New policy type";
    const policyMode: "same" | "different" =
      newPolicy.mode === "different" ? "different" : "same";
    const discountType = newPolicy.discountType;

    const nextDef: PolicyDef = {
      label,
      description,
      mode: policyMode,
      discount: {
        type: discountType,
        different: discountType === "different" ? "yes" : "no",
        holder: "",
        member: "",
        daughter: discountType === "daughter" ? 50 : "",
        byCount: { 1: 0, 2: 5, 3: 5, 4: 10, 5: 10, 6: 10, 7: 10 },
      },
    };
    const nextChart: ChartData = policyMode === "different" ? { holder: [], member: [] } : [];

    persistDefs({ ...state.defs, [key]: nextDef });
    persistCharts({ ...state.charts, [key]: nextChart });
    setPolicy(key);
    setNewPolicy(EMPTY_NEW);
    setMsg({ tone: "ok", text: `New policy type added: ${label}` });
  }

  async function uploadChart(file: File, kind: "common" | "holder" | "member") {
    try {
      const rows = await fileToChartRows(file);
      const target = state.charts[policy];
      let nextChart: ChartData;
      if (kind === "common") {
        nextChart = rows;
      } else {
        const existing = Array.isArray(target) ? {} : (target as { holder?: ChartBand[]; member?: ChartBand[] } | undefined) ?? {};
        nextChart = {
          holder: kind === "holder" ? rows : existing.holder ?? [],
          member: kind === "member" ? rows : existing.member ?? [],
        };
      }
      persistCharts({ ...state.charts, [policy]: nextChart });
      setMsg({ tone: "ok", text: `Chart uploaded successfully for ${def?.label ?? policy}.` });
    } catch (e) {
      setMsg({
        tone: "err",
        text: `Could not parse CSV: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  function updateDiscount(patch: Partial<DiscountConfig>) {
    if (!def) return;
    const merged: DiscountConfig = { ...def.discount, ...patch };
    persistDefs({ ...state.defs, [policy]: { ...def, discount: merged } });
  }

  if (!hydrated) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading admin…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Manage policy types, premium charts and discount rules. Saved to the database.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href="/calculator">
              <ArrowLeft className="size-4" /> Calculator
            </Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={onDiscard}
            disabled={saving || !dirty}
          >
            <RotateCcw className="size-4" /> Discard
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => void onSave()}
            disabled={saving || !dirty}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? "Saving…" : dirty ? "Save changes" : "All saved"}
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden rounded-3xl border border-[#d9e3ee]/90 bg-white/95 shadow-[0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur">
        <CardContent className="space-y-5 p-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "charts" | "discounts")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList className="bg-[#f3f6fa] p-1.5">
                <TabsTrigger
                  value="charts"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-[0_8px_18px_rgba(16,32,51,0.06)]"
                >
                  Charts
                </TabsTrigger>
                <TabsTrigger
                  value="discounts"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-[0_8px_18px_rgba(16,32,51,0.06)]"
                >
                  Discounts
                </TabsTrigger>
              </TabsList>
              <BannerMsg msg={msg} />
            </div>

            <TabsContent value="charts" className="mt-4 space-y-5">
              <PolicyCreator
                value={newPolicy}
                onChange={setNewPolicy}
                onSubmit={addPolicyType}
              />
              <PolicyPicker
                value={policy}
                onChange={(v) => {
                  setPolicy(v);
                  setMsg({ tone: "info", text: "" });
                }}
                state={state}
                description={def?.description ?? ""}
                mode={mode}
                onDescriptionChange={(d) => def && persistDefs({ ...state.defs, [policy]: { ...def, description: d } })}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                {mode === "same" ? (
                  <ChartUpload
                    label="Upload common chart"
                    hint="Single chart for all members, fronted by the holder's age."
                    onFile={(f) => void uploadChart(f, "common")}
                    sample={{
                      filename: `${policy}-common-chart-sample.csv`,
                      content: SAMPLE_COMMON_CSV,
                    }}
                  />
                ) : (
                  <>
                    <ChartUpload
                      label="Upload holder chart"
                      hint="Use Age / Age Group in the first column and Sum Insured values in the next columns."
                      onFile={(f) => void uploadChart(f, "holder")}
                      sample={{
                        filename: `${policy}-holder-chart-sample.csv`,
                        content: SAMPLE_HOLDER_CSV,
                      }}
                    />
                    <ChartUpload
                      label="Upload member chart"
                      hint="Same CSV shape — premiums for non-holder members."
                      onFile={(f) => void uploadChart(f, "member")}
                      sample={{
                        filename: `${policy}-member-chart-sample.csv`,
                        content: SAMPLE_MEMBER_CSV,
                      }}
                    />
                  </>
                )}
              </div>
              <ChartSummary summaries={summaries} />
              <SavedChartsPanel
                policyLabel={def?.label ?? policy}
                policyTypeId={policyTypeId}
                rows={savedCharts}
                loading={savedChartsLoading}
                error={savedChartsErr}
                onRefresh={() => void loadSavedCharts()}
              />
            </TabsContent>

            <TabsContent value="discounts" className="mt-4 space-y-5">
              <PolicyPicker
                value={policy}
                onChange={setPolicy}
                state={state}
                description={def?.description ?? ""}
                mode={mode}
                onDescriptionChange={(d) => def && persistDefs({ ...state.defs, [policy]: { ...def, description: d } })}
              />
              {def ? (
                <DiscountEditor
                  def={def}
                  onChange={(patch) => updateDiscount(patch)}
                  onModeToggle={(next) => {
                    if (!def) return;
                    persistDefs({ ...state.defs, [policy]: { ...def, mode: next } });
                    const existing = state.charts[policy];
                    if (next === "different" && Array.isArray(existing)) {
                      persistCharts({ ...state.charts, [policy]: { holder: existing, member: [] } });
                    } else if (next === "same" && !Array.isArray(existing)) {
                      persistCharts({ ...state.charts, [policy]: existing?.holder ?? [] });
                    }
                  }}
                />
              ) : (
                <p className="text-muted-foreground text-sm">Select a policy to edit its discount rules.</p>
              )}
            </TabsContent>

          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function BannerMsg({ msg }: { msg: { tone: "info" | "ok" | "err"; text: string } }) {
  if (!msg.text) return null;
  const tones: Record<typeof msg.tone, string> = {
    info: "bg-[#eef5ff] border-[#d9e9ff] text-[#174ea6]",
    ok: "bg-emerald-50 border-emerald-200 text-emerald-700",
    err: "bg-rose-50 border-rose-200 text-rose-600",
  };
  return (
    <div
      className={`rounded-[15px] border px-3.5 py-2.5 text-xs font-bold leading-tight sm:max-w-md ${tones[msg.tone]}`}
    >
      {msg.text}
    </div>
  );
}

function PolicyCreator({
  value,
  onChange,
  onSubmit,
}: {
  value: AdminNew;
  onChange: (v: AdminNew) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-[18px] border border-[#e1e9f2] bg-linear-to-b from-white to-[#f8fbff] p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <PlusCircle className="size-5 text-[#174ea6]" />
        <h3 className="text-base font-extrabold tracking-tight text-[#0b1728]">
          Add New Policy Type
        </h3>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Policy Key">
          <Input
            value={value.key}
            onChange={(e) => onChange({ ...value, key: e.target.value })}
            placeholder="e.g. senior_secure"
          />
        </Field>
        <Field label="Policy Name">
          <Input
            value={value.label}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
            placeholder="e.g. Senior Secure"
          />
        </Field>
        <Field label="Chart Mode">
          <Select
            value={value.mode}
            onValueChange={(v) => onChange({ ...value, mode: v as AdminNew["mode"] })}
          >
            <SelectTrigger className="w-full text-left">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="same">Single chart</SelectItem>
              <SelectItem value="different">Separate holder/member charts</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Discount Type">
          <Select
            value={value.discountType}
            onValueChange={(v) =>
              onChange({ ...value, discountType: v as AdminNew["discountType"] })
            }
          >
            <SelectTrigger className="w-full text-left">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="count">Count based</SelectItem>
              <SelectItem value="daughter">Daughter specific</SelectItem>
              <SelectItem value="different">Holder / member split</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Description" className="md:col-span-2 xl:col-span-3">
          <Input
            value={value.description}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            placeholder="Short admin note for this policy type"
          />
        </Field>
        <div className="flex items-end">
          <Button type="button" size="lg" className="w-full gap-1.5" onClick={onSubmit}>
            <PlusCircle className="size-4" /> Add Policy Type
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#66798f]">
        After adding a new policy type, you can upload its chart immediately below and use it
        in the calculator.
      </p>
    </div>
  );
}

function PolicyPicker({
  value,
  onChange,
  state,
  description,
  mode,
  onDescriptionChange,
}: {
  value: PolicyKey;
  onChange: (v: PolicyKey) => void;
  state: PremiumState;
  description: string;
  mode: "same" | "different";
  onDescriptionChange: (d: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Field label="Policy">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-full text-left">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(state.defs).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Chart Mode">
        <Input
          readOnly
          value={mode === "different" ? "Separate holder/member charts" : "Single chart"}
        />
      </Field>
      <Field label="Description">
        <Input
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Short admin note for this policy type"
        />
      </Field>
    </div>
  );
}

function ChartUpload({
  label,
  hint,
  onFile,
  sample,
}: {
  label: string;
  hint: string;
  onFile: (f: File) => void;
  sample?: { filename: string; content: string };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="rounded-[18px] border-[1.5px] border-dashed border-[#a9c5ee] bg-linear-to-b from-[#f7fbff] to-[#eef6ff] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Upload className="size-5 text-[#174ea6]" />
        <h4 className="text-sm font-extrabold tracking-tight text-[#0b1728]">{label}</h4>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[#66798f]">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setFileName(f.name);
            onFile(f);
            e.target.value = "";
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
          Choose CSV
        </Button>
        {sample ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-[#174ea6] hover:bg-[#eef5ff]"
            onClick={() => downloadCsv(sample.filename, sample.content)}
          >
            <Download className="size-4" /> Download sample CSV
          </Button>
        ) : null}
        <span className="text-xs text-[#66798f]">{fileName ?? "No file chosen"}</span>
      </div>
      {sample ? (
        <details className="mt-3 rounded-md border border-[#d9e3ee] bg-white/70 px-3 py-2 text-xs text-[#46546b]">
          <summary className="cursor-pointer font-bold text-[#174ea6]">
            Preview sample format
          </summary>
          <pre className="mt-2 overflow-auto whitespace-pre font-mono text-[11px] leading-snug text-[#0b1728]">
{sample.content}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function ChartSummary({
  summaries,
}: {
  summaries: { title: string; rows: ChartBand[]; kind: "common" | "holder" | "member" }[];
}) {
  return (
    <div className="overflow-auto rounded-[20px] border border-[#e2eaf4] bg-white shadow-[0_3px_16px_rgba(15,23,42,0.04)]">
      <Table>
        <TableHeader>
          <TableRow className="bg-[#f4f8fd] hover:bg-[#f4f8fd]">
            <TableHead className="h-10 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#61758b]">
              Chart
            </TableHead>
            <TableHead className="h-10 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#61758b]">
              Age Bands
            </TableHead>
            <TableHead className="h-10 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#61758b]">
              Supported SI
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {summaries.map((s) => {
            const sis = new Set<number>();
            s.rows.forEach((r) =>
              Object.keys(r.premiums || {}).forEach((k) => sis.add(Number(k))),
            );
            const siList = [...sis].sort((a, b) => a - b);
            return (
              <TableRow key={s.kind}>
                <TableCell className="font-semibold">{s.title}</TableCell>
                <TableCell className="text-sm">
                  {s.rows.length
                    ? s.rows.map((r) => r.label).join(", ")
                    : <span className="text-muted-foreground">No rows yet</span>}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {siList.length
                    ? siList.map((v) => `₹${rs(v)}`).join(", ")
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SavedChartsPanel({
  policyLabel,
  policyTypeId,
  rows,
  loading,
  error,
  onRefresh,
}: {
  policyLabel: string;
  policyTypeId: string;
  rows: SavedChartDetail[] | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-[18px] border border-[#e1e9f2] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold tracking-tight text-[#0b1728]">
            Saved charts in database
          </h3>
          <p className="text-muted-foreground mt-1 text-xs">
            Shows every saved chart version for <span className="font-semibold">{policyLabel}</span>.
          </p>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            PolicyType ID: <span className="font-mono">{policyTypeId || "—"}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCcw className="mr-2 size-4" />}
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Failed to load saved charts: {error}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {rows == null ? (
          <p className="text-muted-foreground text-sm">{loading ? "Loading…" : "No data loaded."}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No charts saved yet for this policy type. Upload a CSV and click Save changes.
          </p>
        ) : (
          rows.map((c) => (
            <div key={c.id} className="rounded-[14px] border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-[#0b1728]">
                  {c.chartKind} · v{c.version}
                </div>
                <div className="text-muted-foreground text-xs">
                  Effective: {new Date(c.effectiveFrom).toLocaleString()}
                </div>
              </div>
              <div className="text-muted-foreground mt-1 text-[11px] font-mono break-all">{c.id}</div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs font-bold">Age bands</div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {c.bands.length
                      ? c.bands.map((b) => `${b.min}-${b.max}`).join(", ")
                      : "—"}
                  </div>
                </div>
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs font-bold">Supported SI</div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {c.siColumns?.length ? c.siColumns.map((n) => `₹${Number(n).toLocaleString("en-IN")}`).join(", ") : "—"}
                  </div>
                </div>
              </div>

              {c.bands.length && c.siColumns.length ? (
                <div className="mt-3 rounded-lg border bg-white p-3">
                  <div className="text-xs font-bold">Premium matrix preview</div>
                  <div className="mt-2 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[7rem]">Age</TableHead>
                          {c.siColumns.map((si) => (
                            <TableHead key={si} className="text-right min-w-[7rem]">
                              ₹{Number(si).toLocaleString("en-IN")}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {c.bands.map((b, idx) => (
                          <TableRow key={`${c.id}-${idx}`}>
                            <TableCell className="font-medium">{b.min}-{b.max}</TableCell>
                            {c.siColumns.map((si) => (
                              <TableCell key={si} className="text-right tabular-nums">
                                {typeof b.premiums?.[String(si)] === "number"
                                  ? Number(b.premiums[String(si)]).toLocaleString("en-IN")
                                  : "—"}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DiscountEditor({
  def,
  onChange,
  onModeToggle,
}: {
  def: PolicyDef;
  onChange: (patch: Partial<DiscountConfig>) => void;
  onModeToggle: (next: "same" | "different") => void;
}) {
  const d = def.discount;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Discount Type">
          <Select
            value={d.type}
            onValueChange={(v) =>
              onChange({
                type: v as DiscountConfig["type"],
                different: v === "different" ? "yes" : "no",
              })
            }
          >
            <SelectTrigger className="w-full text-left">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="count">Count based (1-7 members)</SelectItem>
              <SelectItem value="daughter">Daughter specific</SelectItem>
              <SelectItem value="different">Holder / member split</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Chart Mode">
          <Select
            value={def.mode}
            onValueChange={(v) => onModeToggle(v as "same" | "different")}
          >
            <SelectTrigger className="w-full text-left">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="same">Single chart</SelectItem>
              <SelectItem value="different">Separate holder/member charts</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {d.type === "count" ? (
        <div className="rounded-[18px] border border-[#e1e9f2] bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Save className="size-5 text-[#174ea6]" />
            <h4 className="text-sm font-extrabold tracking-tight text-[#0b1728]">
              Count-based discount (% by member count)
            </h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {([1, 2, 3, 4, 5, 6, 7] as const).map((c) => (
              <Field key={c} label={`${c} ${c === 1 ? "member" : "members"}`}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={Number(d.byCount?.[c] ?? 0)}
                  onChange={(e) =>
                    onChange({
                      byCount: {
                        ...d.byCount,
                        [c]: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      },
                    })
                  }
                />
              </Field>
            ))}
          </div>
        </div>
      ) : null}

      {d.type === "daughter" ? (
        <div className="rounded-[18px] border border-[#e1e9f2] bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Save className="size-5 text-[#174ea6]" />
            <h4 className="text-sm font-extrabold tracking-tight text-[#0b1728]">
              Daughter discount (applies only to rows where relationship = daughter & gender = female)
            </h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Daughter discount %">
              <Input
                type="number"
                min={0}
                max={100}
                value={Number(d.daughter ?? 0)}
                onChange={(e) =>
                  onChange({
                    daughter: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  })
                }
              />
            </Field>
            <Field label="Daughter discount rule">
              <Textarea
                rows={3}
                readOnly
                value={
                  "For asha_kiran: raw discount is floored (e.g. 217.5 → 217).\nFor other policies: raw discount is ceiled.\nNet = ceil(gross − discount)."
                }
              />
            </Field>
          </div>
        </div>
      ) : null}

      {d.type === "different" ? (
        <div className="rounded-[18px] border border-[#e1e9f2] bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Save className="size-5 text-[#174ea6]" />
            <h4 className="text-sm font-extrabold tracking-tight text-[#0b1728]">
              Holder vs member discount split
            </h4>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Holder discount %">
              <Input
                type="number"
                min={0}
                max={100}
                value={Number(d.holder ?? 0)}
                onChange={(e) =>
                  onChange({
                    holder: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  })
                }
              />
            </Field>
            <Field label="Member discount %">
              <Input
                type="number"
                min={0}
                max={100}
                value={Number(d.member ?? 0)}
                onChange={(e) =>
                  onChange({
                    member: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  })
                }
              />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-[12px] font-bold text-[#1d2c42]">{label}</Label>
      {children}
    </div>
  );
}
