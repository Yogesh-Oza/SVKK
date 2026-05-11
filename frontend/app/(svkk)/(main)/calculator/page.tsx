"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  STORAGE_KEY_FORM,
  ensureMembers,
  loadPremiumState,
  quoteFromInput,
  relationshipOptions,
  rs,
  siList,
  toIsoDate,
  type MemberInput,
  type PolicyKey,
  type PremiumState,
} from "@/lib/svkk/premium";

type FormState = {
  policyType: PolicyKey;
  memberCount: number;
  sumInsured: number;
  endDate: string;
  members: MemberInput[];
};

const DEFAULT_FORM: FormState = {
  policyType: "asha_kiran",
  memberCount: 3,
  sumInsured: 500000,
  endDate: "14.10.2026",
  members: [
    { name: "Policy Holder", dob: "13.10.1987", relationship: "self", gender: "male", addOnRider: 0 },
    { name: "Spouse", dob: "05.06.1990", relationship: "spouse", gender: "female", addOnRider: 0 },
    { name: "Daughter", dob: "11.08.2014", relationship: "daughter", gender: "female", addOnRider: 0 },
  ],
};

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function SvkkCalculatorPage() {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<PremiumState>(() => ({
    defs: {},
    charts: {},
  }));
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  useEffect(() => {
    setState(loadPremiumState());
    const storedForm = loadJson<FormState | null>(STORAGE_KEY_FORM, null);
    if (storedForm) setForm(storedForm);
    setHydrated(true);
  }, []);

  // Re-sync defs/charts whenever the admin tab updates localStorage in another
  // window or after navigating back. Cheap and covers the common edit flow.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "svkk_calc_defs_v1" || e.key === "svkk_calc_charts_v1") {
        setState(loadPremiumState());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY_FORM, JSON.stringify(form));
    } catch {
      /* ignore quota */
    }
  }, [form, hydrated]);

  const sis = useMemo(() => siList(state.charts, form.policyType), [state.charts, form.policyType]);

  useEffect(() => {
    setForm((prev) => {
      const members = ensureMembers(prev.members, prev.memberCount, prev.policyType);
      const nextSi = sis.length && !sis.includes(Number(prev.sumInsured)) ? sis[0]! : prev.sumInsured;
      if (members === prev.members && nextSi === prev.sumInsured) return prev;
      return { ...prev, members, sumInsured: nextSi };
    });
  }, [form.policyType, form.memberCount, sis]);

  const quote = useMemo(
    () =>
      quoteFromInput(state, {
        policyType: form.policyType,
        memberCount: form.memberCount,
        sumInsured: form.sumInsured,
        endDate: form.endDate,
        members: form.members,
      }),
    [state, form],
  );

  const updateMember = (index: number, patch: Partial<MemberInput>) => {
    setForm((prev) => ({
      ...prev,
      members: prev.members.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Premium Calculator</h1>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href="/calculator/admin">
            <Settings2 className="size-4" /> Charts &amp; discounts
          </Link>
        </Button>
      </div>

      <Card className="overflow-hidden rounded-3xl border border-[#d9e3ee]/90 bg-white/95 shadow-[0_18px_50px_rgba(15,23,42,0.10)] backdrop-blur">
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FieldShell label="Policy Type" hint={state.defs[form.policyType]?.description}>
              <Select
                value={form.policyType}
                onValueChange={(v) => setForm((prev) => ({ ...prev, policyType: v }))}
              >
                <SelectTrigger className="h-11 w-full text-left">
                  <SelectValue placeholder="Choose a product" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(state.defs).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldShell>
            <FieldShell label="Number of Members">
              <Input
                type="number"
                min={1}
                max={10}
                inputMode="numeric"
                className="h-11"
                value={form.memberCount}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    memberCount: Math.max(1, Math.min(10, Number(e.target.value) || 1)),
                  }))
                }
              />
            </FieldShell>
            <FieldShell label="Sum Insured">
              <Select
                value={String(form.sumInsured)}
                onValueChange={(v) => setForm((prev) => ({ ...prev, sumInsured: Number(v) }))}
              >
                <SelectTrigger className="h-11 w-full text-left">
                  <SelectValue placeholder="Select SI" />
                </SelectTrigger>
                <SelectContent>
                  {sis.map((si) => (
                    <SelectItem key={si} value={String(si)}>
                      ₹{rs(si)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldShell>
            <FieldShell
              label="End Date of Policy"
              hint="Age is calculated from DOB and policy end date."
            >
              <Input
                type="date"
                className="h-11"
                value={toIsoDate(form.endDate)}
                onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
              />
            </FieldShell>
          </div>

          <div className="space-y-4">
            {form.members.map((m, i) => {
              const opts = relationshipOptions(form.policyType, i);
              return (
                <div
                  key={i}
                  className="rounded-[20px] border border-[#e2ebf5] bg-linear-to-b from-white to-[#f8fbff] p-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)] sm:p-5"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-base font-extrabold tracking-tight text-[#0b1728]">
                      {i === 0 ? "Policy Holder" : `Member ${i}`}
                    </h4>
                    <span className="rounded-full bg-[#eef5ff] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#174ea6]">
                      {i === 0 ? "Holder" : "Member"}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <CellShell label="Name">
                      <Input
                        className="h-10"
                        value={m.name}
                        onChange={(e) => updateMember(i, { name: e.target.value })}
                      />
                    </CellShell>
                    <CellShell label="DOB">
                      <Input
                        type="date"
                        className="h-10"
                        value={toIsoDate(m.dob)}
                        onChange={(e) => updateMember(i, { dob: e.target.value })}
                      />
                    </CellShell>
                    <CellShell label="Relationship">
                      <Select
                        value={m.relationship}
                        onValueChange={(v) => updateMember(i, { relationship: v })}
                      >
                        <SelectTrigger className="h-10 w-full text-left capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {opts.map((o) => (
                            <SelectItem key={o} value={o} className="capitalize">
                              {o.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CellShell>
                    <CellShell label="Gender">
                      <Select
                        value={m.gender || "_"}
                        onValueChange={(v) =>
                          updateMember(i, {
                            gender: v === "_" ? "" : (v as MemberInput["gender"]),
                          })
                        }
                      >
                        <SelectTrigger className="h-10 w-full text-left">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_">Select</SelectItem>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </CellShell>
                  </div>
                  <div className="mt-3 grid items-end gap-3 sm:grid-cols-2">
                    <CellShell label="Add-on Rider">
                      <Input
                        type="number"
                        min={0}
                        className="h-10"
                        value={m.addOnRider}
                        onChange={(e) =>
                          updateMember(i, { addOnRider: Math.max(0, Number(e.target.value) || 0) })
                        }
                      />
                    </CellShell>
                    <p className="text-xs leading-relaxed text-[#66798f]">
                      Age is auto-calculated from DOB and policy end date.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Basic Premium" value={`₹${rs(quote.basic)}`} />
            <Stat label="Add-on Rider" value={`₹${rs(quote.rider)}`} />
            <Stat label="Gross Premium" value={`₹${rs(quote.gross)}`} />
            <Stat label="Discount" value={`₹${rs(quote.disc)}`} />
            <Stat label="Net Premium" value={`₹${rs(quote.net)}`} dark />
          </div>

          <div className="overflow-auto rounded-[20px] border border-[#e2eaf4] bg-white shadow-[0_3px_16px_rgba(15,23,42,0.04)]">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#f4f8fd] hover:bg-[#f4f8fd]">
                  {[
                    "Person",
                    "Role",
                    "DOB",
                    "Age",
                    "Relationship",
                    "Gender",
                    "Band",
                    "Basic",
                    "Rider",
                    "Gross",
                    "Discount %",
                    "Discount",
                    "Net",
                    "Status",
                  ].map((h) => (
                    <TableHead
                      key={h}
                      className="h-10 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#61758b]"
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.rows.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{r.name || "—"}</TableCell>
                    <TableCell className="capitalize">{r.role}</TableCell>
                    <TableCell>{r.dob || "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.age ?? "—"}</TableCell>
                    <TableCell className="capitalize">{r.relationship}</TableCell>
                    <TableCell className="capitalize">{r.gender || "—"}</TableCell>
                    <TableCell>{r.band || "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {r.error ? (
                        <span className="text-destructive">{r.error}</span>
                      ) : (
                        `₹${rs(r.basic ?? 0)}`
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.error ? "—" : `₹${rs(r.rider ?? 0)}`}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.error ? "—" : `₹${rs(r.gross ?? 0)}`}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.error ? "—" : `${r.pct ?? 0}%`}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.error ? "—" : `₹${rs(r.disc ?? 0)}`}
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">
                      {r.error ? "—" : `₹${rs(r.net ?? 0)}`}
                    </TableCell>
                    <TableCell>
                      {r.error ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">
                          {r.error}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-600">
                          Ready
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FieldShell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-[#e1e9f2] bg-linear-to-b from-white to-[#f8fbff] p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <Label className="mb-2 block text-[13px] font-extrabold text-[#1d2c42]">{label}</Label>
      {children}
      {hint ? (
        <p className="mt-2 text-xs leading-relaxed text-[#66798f]">{hint}</p>
      ) : null}
    </div>
  );
}

function CellShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-bold text-[#1d2c42]">{label}</Label>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: string;
  dark?: boolean;
}) {
  if (dark) {
    return (
      <div
        className="rounded-[18px] border border-[#143b75] p-4 text-white shadow-[0_4px_18px_rgba(15,23,42,0.04)]"
        style={{
          background: "linear-gradient(135deg,#07152b 0%,#12386f 100%)",
        }}
      >
        <b className="block text-[12px] font-bold uppercase tracking-[0.09em] text-slate-300">
          {label}
        </b>
        <div className="mt-2 text-2xl font-black tracking-tight">{value}</div>
      </div>
    );
  }
  return (
    <div className="rounded-[18px] border border-[#e3ebf5] bg-linear-to-b from-white to-[#f8fbff] p-4 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
      <b className="block text-[12px] font-bold uppercase tracking-[0.09em] text-[#71849a]">
        {label}
      </b>
      <div className="mt-2 text-2xl font-black tracking-tight text-[#0b1728]">{value}</div>
    </div>
  );
}

