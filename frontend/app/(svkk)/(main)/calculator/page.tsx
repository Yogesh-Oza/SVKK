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
import { getSvkkApiBase } from "@/lib/svkk/config";
import { svkkJson } from "@/lib/svkk/api";
import { useCallback, useEffect, useState } from "react";

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

function MemberForm({
  index,
  value,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  value: {
    name: string;
    dob: string;
    relationship: string;
    gender: string;
  };
  onChange: (v: (typeof value)) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="bg-muted/40 space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Member {index + 1}</span>
        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label>Name</Label>
          <Input
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </div>
        <div>
          <Label>DOB</Label>
          <Input
            type="date"
            value={value.dob}
            onChange={(e) => onChange({ ...value, dob: e.target.value })}
          />
        </div>
        <div>
          <Label>Relationship</Label>
          <Input
            value={value.relationship}
            onChange={(e) => onChange({ ...value, relationship: e.target.value })}
            placeholder="self / daughter / son"
          />
        </div>
        <div>
          <Label>Gender</Label>
          <Input
            value={value.gender}
            onChange={(e) => onChange({ ...value, gender: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

const defaultMember = { name: "", dob: "", relationship: "self", gender: "M" };

export default function SvkkCalculatorPage() {
  const [policyTypes, setPolicyTypes] = useState<PolicyTypeRow[]>([]);
  const [charts, setCharts] = useState<ChartRow[]>([]);
  const [policyTypeId, setPolicyTypeId] = useState("");
  const [policyChartId, setPolicyChartId] = useState("");
  const [policyEnd, setPolicyEnd] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [sumInsured, setSumInsured] = useState("500000");
  const [members, setMembers] = useState([{ ...defaultMember }]);
  const [result, setResult] = useState<PremiumResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const missingUrl = !getSvkkApiBase();

  const loadTypes = useCallback(async () => {
    const rows = await svkkJson<PolicyTypeRow[]>("/calculation/reference/policy-types");
    setPolicyTypes(rows);
    setPolicyTypeId((prev) => prev || rows[0]?.id || "");
  }, []);

  const loadCharts = useCallback(
    async (ptId: string) => {
      if (!ptId) {
        return;
      }
      const rows = await svkkJson<ChartRow[]>(
        `/calculation/reference/charts?policyTypeId=${encodeURIComponent(ptId)}`,
      );
      setCharts(rows);
      const firstHolder = rows.find(
        (c) => c.chartKind === "COMBINED" || c.chartKind === "HOLDER",
      );
      if (firstHolder) {
        setPolicyChartId(firstHolder.id);
      } else if (rows[0]) {
        setPolicyChartId(rows[0].id);
      } else {
        setPolicyChartId("");
      }
    },
    [],
  );

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    void (async () => {
      try {
        await loadTypes();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load policy types");
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

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Premium calculator</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Policy type</Label>
          <Select value={policyTypeId} onValueChange={setPolicyTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {policyTypes.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Policy chart (holder/combined for quote)</Label>
          <Select value={policyChartId} onValueChange={setPolicyChartId}>
            <SelectTrigger>
              <SelectValue placeholder="Chart" />
            </SelectTrigger>
            <SelectContent>
              {charts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  v{c.version} · {c.chartKind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Policy end</Label>
            <Input type="date" value={policyEnd} onChange={(e) => setPolicyEnd(e.target.value)} />
          </div>
          <div>
            <Label>Sum insured (must match chart column)</Label>
            <Input
              value={sumInsured}
              onChange={(e) => setSumInsured(e.target.value)}
              inputMode="numeric"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Members</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMembers((m) => [...m, { ...defaultMember }])}
            >
              Add member
            </Button>
          </div>
          {members.map((m, i) => (
            <MemberForm
              key={i}
              index={i}
              value={m}
              canRemove={members.length > 1}
              onChange={(v) => setMembers((prev) => prev.map((p, j) => (j === i ? v : p)))}
              onRemove={() => setMembers((prev) => prev.filter((_, j) => j !== i))}
            />
          ))}
        </div>
        {err ? <p className="text-destructive text-sm">{err}</p> : null}
        <Button type="submit" disabled={loading || !policyChartId}>
          {loading ? "Calculating…" : "Calculate"}
        </Button>
      </form>
      {result ? (
        <div className="space-y-2 rounded-md border p-4">
          <p className="text-lg font-medium">Net premium: ₹{result.netPremium.toFixed(2)}</p>
          <ul className="text-sm">
            {result.lines.map((l, i) => (
              <li key={i}>
                {l.name} ({l.relationship}): ₹{l.net.toFixed(2)} · {l.band}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
