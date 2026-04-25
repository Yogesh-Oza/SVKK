"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import {
  CalendarDays,
  Calculator,
  IndianRupee,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

type PolicyTypeRow = {
  id: string;
  key: string;
  name: string;
  chartMode: string;
  description: string | null;
};

type ChartRow = {
  id: string;
  policyTypeId: string;
  version: number;
  effectiveFrom: string;
  chartKind: string;
};

type PremiumResult = {
  netPremium: number;
  lines: { name: string; relationship: string; net: number; band: string }[];
};

type Member = {
  id: string;
  name: string;
  dob: string;
  relationship: string;
  gender: string;
};

function newMember(over: Partial<Member> = {}): Member {
  return {
    id: crypto.randomUUID(),
    name: "",
    dob: "",
    relationship: "self",
    gender: "M",
    ...over,
  };
}

function formatChartOption(c: ChartRow): string {
  const kind = c.chartKind
    .replace(/_/g, " ")
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return `v${c.version} · ${kind}`;
}

const RELATIONSHIPS = [
  { value: "self", label: "Self" },
  { value: "spouse", label: "Spouse" },
  { value: "son", label: "Son" },
  { value: "daughter", label: "Daughter" },
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "other", label: "Other" },
] as const;

function MemberForm({
  index,
  value,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  value: Member;
  onChange: (v: Member) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const nameId = useId();
  const dobId = useId();
  const relId = useId();
  const genId = useId();

  return (
    <div className="from-muted/20 to-card bg-linear-to-b space-y-4 rounded-xl border p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="bg-primary/8 text-primary border-primary/20 flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums">
            {index + 1}
          </div>
          <div>
            <p className="text-foreground text-sm font-medium">Insured member</p>
            <p className="text-muted-foreground text-xs">Details as per proposal</p>
          </div>
        </div>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive size-8 shrink-0"
            onClick={onRemove}
            aria-label={`Remove member ${index + 1}`}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={nameId} className="text-xs font-medium">
            Full name
          </Label>
          <div className="relative">
            <UserRound className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              id={nameId}
              className="pl-9"
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              placeholder="As on ID / policy"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={dobId} className="text-xs font-medium">
            Date of birth
          </Label>
          <div className="relative">
            <CalendarDays className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              id={dobId}
              type="date"
              className="pl-9"
              value={value.dob}
              onChange={(e) => onChange({ ...value, dob: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={genId} className="text-xs font-medium">
            Gender
          </Label>
          <Select
            value={value.gender}
            onValueChange={(gender) => onChange({ ...value, gender })}
          >
            <SelectTrigger id={genId} className="w-full">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">Male</SelectItem>
              <SelectItem value="F">Female</SelectItem>
              <SelectItem value="O">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={relId} className="text-xs font-medium">
            Relationship to proposer
          </Label>
          <Select
            value={value.relationship}
            onValueChange={(relationship) => onChange({ ...value, relationship })}
          >
            <SelectTrigger id={relId} className="w-full">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {RELATIONSHIPS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function formatInr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

export default function SvkkCalculatorPage() {
  const [policyTypes, setPolicyTypes] = useState<PolicyTypeRow[]>([]);
  const [charts, setCharts] = useState<ChartRow[]>([]);
  const [policyTypeId, setPolicyTypeId] = useState("");
  const [policyChartId, setPolicyChartId] = useState("");
  const [policyEnd, setPolicyEnd] = useState(new Date().toISOString().slice(0, 10));
  const [sumInsured, setSumInsured] = useState("500000");
  const [members, setMembers] = useState<Member[]>(() => [newMember()]);
  const [result, setResult] = useState<PremiumResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [typesLoading, setTypesLoading] = useState(true);
  const missingUrl = !getSvkkApiBase();

  const loadTypes = useCallback(async () => {
    const rows = await svkkJson<PolicyTypeRow[]>("/calculation/reference/policy-types");
    setPolicyTypes(rows);
    setPolicyTypeId((prev) => prev || rows[0]?.id || "");
  }, []);

  const loadCharts = useCallback(async (ptId: string) => {
    if (!ptId) {
      return;
    }
    const rows = await svkkJson<ChartRow[]>(
      `/calculation/reference/charts?policyTypeId=${encodeURIComponent(ptId)}`,
    );
    setCharts(rows);
    const firstHolder = rows.find((c) => c.chartKind === "COMBINED" || c.chartKind === "HOLDER");
    if (firstHolder) {
      setPolicyChartId(firstHolder.id);
    } else if (rows[0]) {
      setPolicyChartId(rows[0].id);
    } else {
      setPolicyChartId("");
    }
  }, []);

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    void (async () => {
      setTypesLoading(true);
      try {
        await loadTypes();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load policy types");
      } finally {
        setTypesLoading(false);
      }
    })();
  }, [missingUrl, loadTypes]);

  useEffect(() => {
    if (missingUrl || !policyTypeId) {
      return;
    }
    void (async () => {
      try {
        setErr(null);
        await loadCharts(policyTypeId);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load charts");
      }
    })();
  }, [policyTypeId, missingUrl, loadCharts]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setResult(null);
    setLoading(true);
    try {
      const body = {
        policyTypeId,
        policyChartId,
        policyEnd: new Date(policyEnd).toISOString(),
        sumInsured: Number(sumInsured),
        members: members.map((m) => ({
          name: m.name,
          dob: new Date(m.dob).toISOString(),
          relationship: m.relationship,
          gender: m.gender,
        })),
      };
      const res = await svkkJson<PremiumResult>("/calculation/live", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Calculation failed");
    } finally {
      setLoading(false);
    }
  }

  if (missingUrl) {
    return (
      <p className="text-destructive text-sm">
        Set <code className="font-mono">NEXT_PUBLIC_API_URL</code> in <code className="font-mono">frontend/.env</code>
      </p>
    );
  }

  const selectedType = policyTypes.find((p) => p.id === policyTypeId);
  const sumInsuredNum = Number(sumInsured.replace(/,/g, ""));
  const sumInsuredValid = Number.isFinite(sumInsuredNum) && sumInsuredNum > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary border-primary/15 flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm">
              <Calculator className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Premium calculator</h1>
              <p className="text-muted-foreground mt-0.5 max-w-xl text-pretty text-sm">
                Run a live chart quote: pick policy, chart, sum insured, and members. Net premium
                updates from your active rate tables.
              </p>
            </div>
          </div>
        </div>
        {result ? (
          <Badge variant="secondary" className="h-8 w-fit gap-1 px-3 text-xs">
            <Sparkles className="size-3.5" />
            Estimate ready
          </Badge>
        ) : null}
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_minmax(300px,380px)]">
        <form onSubmit={onSubmit} className="space-y-6">
          <Card className="overflow-hidden border shadow-sm">
            <CardHeader className="bg-muted/30 border-b">
              <div className="flex items-start gap-3">
                <div className="bg-background flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm">
                  <IndianRupee className="text-primary size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Policy & coverage</CardTitle>
                  <CardDescription>
                    Select the product and rate chart, then the policy end date and sum insured that
                    match your chart column.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              {typesLoading ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Loading policy products…
                </div>
              ) : null}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="pt">Policy type</Label>
                  <Select value={policyTypeId} onValueChange={setPolicyTypeId} disabled={typesLoading || !policyTypes.length}>
                    <SelectTrigger id="pt" className="h-11 w-full text-left">
                      <SelectValue placeholder="Choose a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {policyTypes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="font-medium">{p.name}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedType?.description ? (
                    <p className="text-muted-foreground text-xs leading-relaxed">{selectedType.description}</p>
                  ) : null}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ch">Policy chart (quote basis)</Label>
                  <Select value={policyChartId} onValueChange={setPolicyChartId} disabled={!charts.length}>
                    <SelectTrigger id="ch" className="h-11 w-full text-left">
                      <SelectValue placeholder="Choose chart version" />
                    </SelectTrigger>
                    <SelectContent>
                      {charts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {formatChartOption(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">Usually the holder or combined family chart.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pe">Policy end</Label>
                  <div className="relative">
                    <CalendarDays className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                    <Input
                      id="pe"
                      type="date"
                      className="h-11 pl-9"
                      value={policyEnd}
                      onChange={(e) => setPolicyEnd(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si">Sum insured (₹)</Label>
                  <div className="relative">
                    <IndianRupee className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
                    <Input
                      id="si"
                      className="h-11 pl-9 font-mono tabular-nums"
                      value={sumInsured}
                      onChange={(e) => setSumInsured(e.target.value.replace(/[^\d]/g, ""))}
                      inputMode="numeric"
                      placeholder="500000"
                    />
                  </div>
                  {sumInsuredValid ? (
                    <p className="text-muted-foreground text-xs">
                      = {new Intl.NumberFormat("en-IN").format(sumInsuredNum)} (must match a column in
                      the selected chart)
                    </p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border shadow-sm">
            <CardHeader className="bg-muted/30 border-b">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="bg-background flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm">
                    <Users className="text-primary size-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Insured members</CardTitle>
                    <CardDescription>Add every person covered; proposer is usually member 1 (self).</CardDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => setMembers((m) => [...m, newMember()])}
                >
                  <Plus className="size-4" />
                  Add member
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {members.map((m, i) => (
                <MemberForm
                  key={m.id}
                  index={i}
                  value={m}
                  canRemove={members.length > 1}
                  onChange={(v) => setMembers((prev) => prev.map((p) => (p.id === m.id ? v : p)))}
                  onRemove={() => setMembers((prev) => prev.filter((p) => p.id !== m.id))}
                />
              ))}
            </CardContent>
            <Separator />
            <CardFooter className="bg-muted/10 flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              {err ? (
                <p className="text-destructive w-full text-sm sm:order-2 sm:max-w-md">{err}</p>
              ) : (
                <p className="text-muted-foreground w-full text-xs sm:order-2 sm:max-w-md">
                  Ensure DOBs and sum insured are valid for the API before running.
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                className="w-full min-w-[200px] gap-2 sm:w-auto"
                disabled={loading || !policyChartId || !sumInsuredValid}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
                {loading ? "Calculating…" : "Calculate premium"}
              </Button>
            </CardFooter>
          </Card>
        </form>

        <aside className="lg:sticky lg:top-4 space-y-4">
          {result ? (
            <Card className="from-primary/5 border-primary/20 bg-linear-to-b to-card overflow-hidden border-2 shadow-md">
              <CardHeader className="pb-2">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Result
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                    {formatInr(result.netPremium)}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">Net premium (as returned by the engine)</p>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-2 text-xs font-medium">Breakdown</p>
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="h-9 text-xs">Member</TableHead>
                        <TableHead className="h-9 text-xs">Rel.</TableHead>
                        <TableHead className="h-9 text-right text-xs">Net</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.lines.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm font-medium">{l.name || "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm capitalize">
                            {l.relationship}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatInr(l.net)}
                            <span className="text-muted-foreground block text-xs font-normal">
                              {l.band}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-muted/20 border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Premium estimate</CardTitle>
                <CardDescription>
                  Your net premium and per-member lines will show here after a successful run.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-muted-foreground flex items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-sm">
                  <Calculator className="size-5 opacity-50" />
                  Awaiting calculation
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
