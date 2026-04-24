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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type PolicyTypeRow = { id: string; name: string };
type ChartRow = { id: string; version: number; chartKind: string };

export default function SvkkNewPolicyPage() {
  const router = useRouter();
  const [types, setTypes] = useState<PolicyTypeRow[]>([]);
  const [charts, setCharts] = useState<ChartRow[]>([]);
  const [mobile, setMobile] = useState("");
  const [partyName, setPartyName] = useState("");
  const [email, setEmail] = useState("");
  const [policyTypeId, setPolicyTypeId] = useState("");
  const [policyChartId, setPolicyChartId] = useState("");
  const [yearLabel, setYearLabel] = useState(String(new Date().getFullYear()));
  const [sumInsured, setSumInsured] = useState("500000");
  const [village, setVillage] = useState("");
  const [mName, setMName] = useState("");
  const [mDob, setMDob] = useState("");
  const [mRel, setMRel] = useState("self");
  const [mGender, setMGender] = useState("M");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const missingUrl = !getSvkkApiBase();

  const loadCharts = useCallback(async (ptId: string) => {
    const rows = await svkkJson<ChartRow[]>(
      `/calculation/reference/charts?policyTypeId=${encodeURIComponent(ptId)}`,
    );
    setCharts(rows);
    const pick =
      rows.find((c) => c.chartKind === "COMBINED" || c.chartKind === "HOLDER") ?? rows[0];
    setPolicyChartId(pick?.id ?? "");
  }, []);

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    void (async () => {
      const list = await svkkJson<PolicyTypeRow[]>("/calculation/reference/policy-types");
      setTypes(list);
      if (list[0]) {
        setPolicyTypeId(list[0].id);
        await loadCharts(list[0].id);
      }
    })();
  }, [missingUrl, loadCharts]);

  useEffect(() => {
    if (!policyTypeId || missingUrl) {
      return;
    }
    void loadCharts(policyTypeId);
  }, [policyTypeId, missingUrl, loadCharts]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      const body = {
        mobile,
        partyName,
        email: email || null,
        policyTypeId,
        yearLabel,
        policyChartId,
        sumInsured: Number(sumInsured),
        village: village || null,
        members: [
          {
            name: mName || partyName,
            dob: new Date(mDob).toISOString(),
            relationship: mRel,
            gender: mGender,
          },
        ],
      };
      const res = await svkkJson<{ policy: { id: string } }>("/policies", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push(`/policies/${res.policy.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setPending(false);
    }
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/policies">Back</Link>
        </Button>
        <h1 className="text-2xl font-semibold">New policy</h1>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Mobile</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} required />
          </div>
          <div>
            <Label>Party name</Label>
            <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} required />
          </div>
        </div>
        <div>
          <Label>Email (optional)</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label>Policy type</Label>
          <Select value={policyTypeId} onValueChange={setPolicyTypeId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Chart</Label>
          <Select value={policyChartId} onValueChange={setPolicyChartId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {charts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  v{c.version} {c.chartKind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Year label</Label>
            <Input value={yearLabel} onChange={(e) => setYearLabel(e.target.value)} required />
          </div>
          <div>
            <Label>Sum insured</Label>
            <Input
              value={sumInsured}
              onChange={(e) => setSumInsured(e.target.value)}
              inputMode="numeric"
              required
            />
          </div>
        </div>
        <div>
          <Label>Village (optional)</Label>
          <Input value={village} onChange={(e) => setVillage(e.target.value)} />
        </div>
        <div className="border-t pt-4">
          <p className="mb-2 text-sm font-medium">Primary member</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={mName} onChange={(e) => setMName(e.target.value)} />
            </div>
            <div>
              <Label>DOB</Label>
              <Input type="date" value={mDob} onChange={(e) => setMDob(e.target.value)} required />
            </div>
            <div>
              <Label>Relationship</Label>
              <Input value={mRel} onChange={(e) => setMRel(e.target.value)} />
            </div>
            <div>
              <Label>Gender</Label>
              <Input value={mGender} onChange={(e) => setMGender(e.target.value)} />
            </div>
          </div>
        </div>
        {err ? <p className="text-destructive text-sm">{err}</p> : null}
        <Button type="submit" disabled={pending || !policyChartId}>
          {pending ? "Saving…" : "Create policy"}
        </Button>
      </form>
    </div>
  );
}
