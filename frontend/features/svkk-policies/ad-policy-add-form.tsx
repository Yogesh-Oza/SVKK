"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { apiPost, svkkJson } from "@/lib/svkk/api";
import { FilePlus, Loader2, Minus, Plus, ArrowLeft, Calculator } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AD_PRODUCT_OPTIONS, toAdProductVariant } from "./ad-product-variant";
import type { PolicyGrouping } from "./ad-policy-types";

type ChartRow = { id: string; version: number; chartKind: string };
type PolicyTypeRow = { id: string; key: string; name: string };

function parseNum(s: string): number | undefined {
  const t = s.replace(/,/g, "").trim();
  if (!t) {
    return undefined;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function ageFromDob(iso: string): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) {
    a -= 1;
  }
  return a >= 0 ? String(a) : "";
}

export type AdMemberRow = {
  name: string;
  relationship: string;
  dob: string;
  age: string;
  dateOfJoining: string;
  sumInsured: string;
  cumulativeBonus: string;
  phNo: string;
  basicPremium: string;
  gender: string;
};

function emptyMember(): AdMemberRow {
  return {
    name: "",
    relationship: "",
    dob: "",
    age: "",
    dateOfJoining: "",
    sumInsured: "",
    cumulativeBonus: "",
    phNo: "",
    basicPremium: "",
    gender: "M",
  };
}

const GENDERS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "O", label: "Other" },
];

const CHEQUE_STATUS = [
  { value: "none", label: "Select Cheque Status" },
  { value: "CLEARED", label: "CLEARED" },
  { value: "DISHONOURED", label: "DISHONOURED" },
] as const;

const YES_NO = [
  { value: "", label: "—" },
  { value: "YES", label: "YES" },
  { value: "NO", label: "NO" },
] as const;

const GROUPING: { value: "" | PolicyGrouping; label: string }[] = [
  { value: "", label: "Policy Grouping" },
  { value: "SVKK", label: "SVKK" },
  { value: "NVKK", label: "NVKK" },
  { value: "RTY", label: "RTY" },
  { value: "OTHER", label: "OTHER" },
];

export function AdPolicyAddForm() {
  const router = useRouter();
  const idPrefix = useId();
  const idemKeyRef = useRef(crypto.randomUUID());
  const missingUrl = !getSvkkApiBase();

  const [policyTypeId, setPolicyTypeId] = useState("");
  const [policyChartId, setPolicyChartId] = useState("");
  const [chartOpts, setChartOpts] = useState<ChartRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [policyNo, setPolicyNo] = useState("");
  const [adProduct, setAdProduct] = useState("Asha-Kiran");
  const [customerId, setCustomerId] = useState("");
  const [svkkPublicId, setSvkkPublicId] = useState("");
  const [policyHolder, setPolicyHolder] = useState("");
  const [panNo, setPanNo] = useState("");
  const [company, setCompany] = useState("");
  const [tpa, setTpa] = useState("");
  const [policyStart, setPolicyStart] = useState("");
  const [policyEnd, setPolicyEnd] = useState("");
  const [village, setVillage] = useState("");
  const [cat, setCat] = useState("");
  const [dob, setDob] = useState("");
  const [age, setAge] = useState("");
  const [relation, setRelation] = useState("");
  const [person, setPerson] = useState("");
  const [sumInsured, setSumInsured] = useState("");
  const [comulativeBonus, setComulativeBonus] = useState("");
  const [joiningYear, setJoiningYear] = useState("");
  const [basicPremiumPs, setBasicPremiumPs] = useState("");
  const [members, setMembers] = useState<AdMemberRow[]>(() => [emptyMember(), emptyMember()]);

  const [policyChequeNo, setPolicyChequeNo] = useState("");
  const [bank, setBank] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [branch, setBranch] = useState("");
  const [nameAsPerCheque, setNameAsPerCheque] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [notOver, setNotOver] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [chequeStatus, setChequeStatus] = useState("");
  const [reasonDishonoured, setReasonDishonoured] = useState("");

  const [vkkPremium, setVkkPremium] = useState("");
  const [coPremium, setCoPremium] = useState("");
  const [grossPremium, setGrossPremium] = useState("");
  const [commission, setCommission] = useState("");
  const [twoLakhF, setTwoLakhF] = useState("");
  const [policyHolderPremium, setPolicyHolderPremium] = useState("");
  const [gaamMahajan, setGaamMahajan] = useState("");
  const [excessShort, setExcessShort] = useState("");
  const [diffAmt, setDiffAmt] = useState("");

  const [loanStatus, setLoanStatus] = useState("");
  const [loanAmt, setLoanAmt] = useState("");
  const [nomineeName, setNomineeName] = useState("");
  const [nomineeRelation, setNomineeRelation] = useState("");

  const [address, setAddress] = useState("");
  const [addressTwo, setAddressTwo] = useState("");
  const [addressThree, setAddressThree] = useState("");
  const [addressFour, setAddressFour] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [mobileFirst, setMobileFirst] = useState("");
  const [mobileSecond, setMobileSecond] = useState("");
  const [email, setEmail] = useState("");

  const [refundChequeAmt, setRefundChequeAmt] = useState("");
  const [refundChequeNo, setRefundChequeNo] = useState("");
  const [refundChequeDate, setRefundChequeDate] = useState("");
  const [cdAccountStatus, setCdAccountStatus] = useState("");
  const [cdAmount, setCdAmount] = useState("");

  const [notCourier, setNotCourier] = useState("");
  const [courierDate, setCourierDate] = useState("");
  const [courierAddress, setCourierAddress] = useState("");
  const [remark, setRemark] = useState("");
  const [refNo, setRefNo] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [policyGrouping, setPolicyGrouping] = useState<"" | PolicyGrouping>("");
  const [url, setUrl] = useState("");

  const loadAdPolicyType = useCallback(async () => {
    const types = await svkkJson<PolicyTypeRow[]>("/calculation/reference/policy-types");
    const ad = types.find((t) => t.key === "ad_policy") ?? types.find((t) => t.key === "asha_kiran");
    if (!ad) {
      throw new Error("No AD or Asha Kiran policy type in database. Run prisma seed.");
    }
    setPolicyTypeId(ad.id);
    const charts = await svkkJson<ChartRow[]>(
      `/calculation/reference/charts?policyTypeId=${encodeURIComponent(ad.id)}`,
    );
    setChartOpts(charts);
    const h = charts.find((c) => c.chartKind === "COMBINED" || c.chartKind === "HOLDER");
    setPolicyChartId(h?.id ?? charts[0]?.id ?? "");
  }, []);

  useEffect(() => {
    if (missingUrl) {
      return;
    }
    void (async () => {
      setLoadErr(null);
      try {
        await loadAdPolicyType();
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Failed to load policy type");
      }
    })();
  }, [missingUrl, loadAdPolicyType]);

  useEffect(() => {
    setAge(ageFromDob(dob));
  }, [dob]);

  const updateMember = (i: number, patch: Partial<AdMemberRow>) => {
    setMembers((arr) => {
      const n = [...arr];
      n[i] = { ...n[i]!, ...patch };
      if (patch.dob !== undefined) {
        n[i]!.age = ageFromDob(n[i]!.dob);
      }
      return n;
    });
  };

  const addMember = () => setMembers((m) => [...m, emptyMember()]);
  const removeMember = (i: number) => {
    setMembers((m) => (m.length <= 1 ? m : m.filter((_, j) => j !== i)));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!refNo.trim()) {
      setErr("Reference number is required.");
      return;
    }
    if (!mobileFirst.trim()) {
      setErr("Primary mobile is required.");
      return;
    }
    if (!policyHolder.trim()) {
      setErr("Policy holder name is required.");
      return;
    }
    const si = parseNum(sumInsured);
    if (si == null || si <= 0) {
      setErr("Enter a valid sum insured.");
      return;
    }
    if (!policyTypeId || !policyChartId) {
      setErr("Policy type / chart not loaded.");
      return;
    }
    const variant = toAdProductVariant(adProduct);
    if (!variant) {
      setErr("Select a policy type (Family / Individual / Asha Kiran).");
      return;
    }
    const validMembers = members.filter((m) => m.name.trim() && m.dob);
    if (validMembers.length < 1) {
      setErr("Add at least one member with name and date of birth.");
      return;
    }

    setLoading(true);
    try {
      const adVariant = variant;
      const yearLabel = year.trim() || String(new Date().getFullYear());
      const body: Record<string, unknown> = {
        mobile: mobileFirst.replace(/\D/g, "").slice(0, 12),
        partyName: policyHolder.trim(),
        email: email.trim() || null,
        pan: panNo.trim() || null,
        dateOfBirth: dob ? new Date(dob).toISOString() : null,
        policyTypeId,
        policyChartId,
        yearLabel,
        policyStart: policyStart ? new Date(policyStart).toISOString() : null,
        policyEnd: policyEnd ? new Date(policyEnd).toISOString() : null,
        sumInsured: si,
        expectedNetPremium: parseNum(coPremium) ?? null,
        policyNo: policyNo.trim() || null,
        village: village.trim() || null,
        adProductVariant: adVariant,
        customerId: customerId.trim() || null,
        svkkPublicId: svkkPublicId.trim() || null,
        insuranceCompany: company.trim() || null,
        tpa: tpa.trim() || null,
        categoryText: cat.trim() || null,
        holderRelationship: relation.trim() || null,
        holderAge: parseNum(age) != null ? Math.round(parseNum(age)!) : null,
        personsInsuredCount: parseNum(person) != null ? Math.round(parseNum(person)!) : validMembers.length,
        area: area.trim() || null,
        referenceNo: refNo.trim(),
        mobileSecondary: mobileSecond.trim() || null,
        policyGrouping: policyGrouping || null,
        policyUrl: url.trim() || null,
        loanStatus: loanStatus || null,
        loanAmount: parseNum(loanAmt) ?? null,
        refundChequeAmount: parseNum(refundChequeAmt) ?? null,
        refundChequeNo: refundChequeNo.trim() || null,
        refundChequeDate: refundChequeDate ? new Date(refundChequeDate).toISOString() : null,
        cdAccountUsed: cdAccountStatus === "YES" ? true : cdAccountStatus === "NO" ? false : null,
        cdAmount: parseNum(cdAmount) ?? null,
        courierStatus: notCourier || null,
        courierDate: courierDate ? new Date(courierDate).toISOString() : null,
        courierAddress: courierAddress.trim() || null,
        periodYearText: year.trim() || null,
        periodMonthText: month.trim() || null,
        addressLine1: address.trim() || null,
        addressLine2: addressTwo.trim() || null,
        addressLine3: addressThree.trim() || null,
        addressLine4: addressFour.trim() || null,
        city: city.trim() || null,
        pincode: pincode.trim() || null,
        contactPhone: mobileFirst.replace(/\D/g, "").slice(0, 12) || null,
        nomineeName: nomineeName.trim() || null,
        nomineeRelation: nomineeRelation.trim() || null,
        remarks: remark.trim() || null,
        holderCumulativeBonus: parseNum(comulativeBonus) ?? null,
        holderJoiningYear: joiningYear.trim() || null,
        holderBasicPremium: parseNum(basicPremiumPs) ?? null,
        vkkPremium: parseNum(vkkPremium) ?? null,
        grossPremium: parseNum(grossPremium) ?? null,
        commissionAmount: parseNum(commission) ?? null,
        twoLacFloater: parseNum(twoLakhF) ?? null,
        yearPolicyHolderPremium: parseNum(policyHolderPremium) ?? null,
        gaamMahajanVkk: parseNum(gaamMahajan) ?? null,
        excessShortAmount: parseNum(excessShort) ?? null,
        diffPaidByHolder: parseNum(diffAmt) ?? null,
        members: validMembers.map((m) => ({
          name: m.name.trim(),
          dob: new Date(m.dob).toISOString(),
          relationship: m.relationship.trim() || "Self",
          gender: m.gender || "M",
          sumInsured: parseNum(m.sumInsured) ?? null,
          cumulativeBonus: parseNum(m.cumulativeBonus) ?? null,
          dateOfJoining: m.dateOfJoining ? new Date(m.dateOfJoining).toISOString() : null,
          memberPhone: m.phNo.trim() || null,
          basicPremium: parseNum(m.basicPremium) ?? null,
          ageAtEntry: parseNum(m.age) != null ? Math.round(parseNum(m.age)!) : null,
        })),
      };

      if (
        policyChequeNo.trim() &&
        bank.trim() &&
        parseNum(coPremium) != null &&
        (parseNum(coPremium) as number) >= 0
      ) {
        const st =
          chequeStatus === "DISHONOURED"
            ? "DISHONOURED"
            : chequeStatus === "CLEARED"
              ? "CLEARED"
              : "PENDING";
        body.initialPayment = {
          amount: parseNum(coPremium) ?? 0,
          method: "CHQ",
          cheque: {
            number: policyChequeNo.trim(),
            bankName: bank.trim(),
            ifsc: ifsc.trim() || null,
            status: st,
            reason: st === "DISHONOURED" ? reasonDishonoured.trim() || "Dishonoured" : null,
            accountNo: accountNo.trim() || null,
            branch: branch.trim() || null,
            nameAsPerCheque: nameAsPerCheque.trim() || null,
            notOver: notOver.trim() || null,
            chequeDate: chequeDate ? new Date(chequeDate).toISOString() : null,
          },
        };
        body.paymentMode = "CHQ";
        body.bankName = bank.trim() || null;
        body.bankAccountLast4 = accountNo.trim() ? accountNo.replace(/\D/g, "").slice(-4) : null;
      }

      const res = await apiPost<Record<string, unknown>>("/policies", body, {
        headers: { "Idempotency-Key": idemKeyRef.current },
      });
      const id = typeof res.id === "string" ? res.id : null;
      if (id) {
        void router.push(`/policies/${id}`);
        return;
      }
      setErr("Created but response had no id");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setLoading(false);
    }
  }

  if (missingUrl) {
    return <p className="text-destructive text-sm">Configure NEXT_PUBLIC_API_URL.</p>;
  }
  if (loadErr) {
    return <p className="text-destructive text-sm">{loadErr}</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <FilePlus className="text-primary size-6" />
            <h1 className="text-2xl font-semibold">Add AD policy</h1>
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Full data entry for the AD product (Family Floater / Individual / Asha Kiran). Premium
            calculator is a separate page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/calculator" className="gap-1">
              <Calculator className="size-4" />
              Premium calculator
            </Link>
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/policies" className="gap-1">
              <ArrowLeft className="size-4" />
              Policies
            </Link>
          </Button>
        </div>
      </div>

      {policyChartId ? (
        <p className="text-muted-foreground text-xs">
          Active rate chart: v
          {chartOpts.find((c) => c.id === policyChartId)?.version} —{" "}
          {chartOpts.find((c) => c.id === policyChartId)?.chartKind}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-6">
        {err ? <p className="text-destructive text-sm">{err}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Personal info</CardTitle>
            <CardDescription>Policy, holder, and first-year coverage</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Policy number</Label>
              <Input value={policyNo} onChange={(e) => setPolicyNo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Policy type (AD)</Label>
              <Select value={adProduct} onValueChange={setAdProduct}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AD_PRODUCT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Customer ID</Label>
              <Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>SVKK ID</Label>
              <Input
                value={svkkPublicId}
                onChange={(e) => setSvkkPublicId(e.target.value)}
                placeholder="Optional; auto if empty"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Policy holder name</Label>
              <Input value={policyHolder} onChange={(e) => setPolicyHolder(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>PAN</Label>
              <Input value={panNo} onChange={(e) => setPanNo(e.target.value.toUpperCase())} maxLength={10} />
            </div>
            <div className="space-y-2">
              <Label>Insurance company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>TPA</Label>
              <Input value={tpa} onChange={(e) => setTpa(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Policy start</Label>
              <Input type="date" value={policyStart} onChange={(e) => setPolicyStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Policy expiry</Label>
              <Input type="date" value={policyEnd} onChange={(e) => setPolicyEnd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Village</Label>
              <Input value={village} onChange={(e) => setVillage(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={cat} onChange={(e) => setCat(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-dob`}>Date of birth (holder)</Label>
              <Input id={`${idPrefix}-dob`} type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Age</Label>
              <Input value={age} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Input value={relation} onChange={(e) => setRelation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>No. of persons insured</Label>
              <Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="e.g. 2" />
            </div>
            <div className="space-y-2">
              <Label>Sum insured (₹)</Label>
              <Input value={sumInsured} onChange={(e) => setSumInsured(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Cumulative bonus (holder)</Label>
              <Input value={comulativeBonus} onChange={(e) => setComulativeBonus(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Joining year</Label>
              <Input value={joiningYear} onChange={(e) => setJoiningYear(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Basic premium (holder)</Label>
              <Input value={basicPremiumPs} onChange={(e) => setBasicPremiumPs(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Insured members</CardTitle>
            <CardDescription>Per-member sum insured, bonus, and premium</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {members.map((m, i) => (
              <div
                key={i}
                className="relative rounded-lg border p-3"
              >
                <p className="text-muted-foreground mb-2 text-xs font-medium">Member {i + 1}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    placeholder="Name"
                    value={m.name}
                    onChange={(e) => updateMember(i, { name: e.target.value })}
                  />
                  <Input
                    placeholder="Relationship"
                    value={m.relationship}
                    onChange={(e) => updateMember(i, { relationship: e.target.value })}
                  />
                  <Input
                    type="date"
                    value={m.dob}
                    onChange={(e) => updateMember(i, { dob: e.target.value })}
                  />
                  <Input placeholder="Age" value={m.age} readOnly className="bg-muted" />
                  <Input
                    type="date"
                    value={m.dateOfJoining}
                    onChange={(e) => updateMember(i, { dateOfJoining: e.target.value })}
                  />
                  <Input
                    placeholder="Sum insured"
                    value={m.sumInsured}
                    onChange={(e) => updateMember(i, { sumInsured: e.target.value })}
                  />
                  <Input
                    placeholder="Cumulative bonus"
                    value={m.cumulativeBonus}
                    onChange={(e) => updateMember(i, { cumulativeBonus: e.target.value })}
                  />
                  <Input
                    placeholder="Phone"
                    value={m.phNo}
                    onChange={(e) => updateMember(i, { phNo: e.target.value })}
                  />
                  <div className="flex gap-2 lg:col-span-2">
                    <Select value={m.gender} onValueChange={(v) => updateMember(i, { gender: v })}>
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Gender" />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDERS.map((g) => (
                          <SelectItem key={g.value} value={g.value}>
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Basic premium"
                      value={m.basicPremium}
                      onChange={(e) => updateMember(i, { basicPremium: e.target.value })}
                      className="flex-1"
                    />
                    {members.length > 1 ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="shrink-0"
                        onClick={() => removeMember(i)}
                        aria-label="Remove member"
                      >
                        <Minus className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={addMember} className="gap-1">
              <Plus className="size-4" />
              Add another member
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Policy cheque & bank</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Policy cheque no</Label>
              <Input value={policyChequeNo} onChange={(e) => setPolicyChequeNo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bank name</Label>
              <Input value={bank} onChange={(e) => setBank(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Account no</Label>
              <Input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Name as per cheque</Label>
              <Input value={nameAsPerCheque} onChange={(e) => setNameAsPerCheque(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>IFSC</Label>
              <Input value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-2">
              <Label>Not over</Label>
              <Input value={notOver} onChange={(e) => setNotOver(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cheque date</Label>
              <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cheque status</Label>
              <Select
                value={chequeStatus || "none"}
                onValueChange={(v) => setChequeStatus(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHEQUE_STATUS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Reason for dishonoured</Label>
              <Input value={reasonDishonoured} onChange={(e) => setReasonDishonoured(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Premiums & commission</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>SVKK / VKK premium</Label>
              <Input value={vkkPremium} onChange={(e) => setVkkPremium(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Net premium</Label>
              <Input value={coPremium} onChange={(e) => setCoPremium(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Gross premium</Label>
              <Input value={grossPremium} onChange={(e) => setGrossPremium(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Commission</Label>
              <Input value={commission} onChange={(e) => setCommission(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>1 Lac ind / 2 Lac floater</Label>
              <Input value={twoLakhF} onChange={(e) => setTwoLakhF(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Policy holder premium</Label>
              <Input value={policyHolderPremium} onChange={(e) => setPolicyHolderPremium(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Gaam Mahajan / VKK contribution</Label>
              <Input value={gaamMahajan} onChange={(e) => setGaamMahajan(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Excess / short amount</Label>
              <Input value={excessShort} onChange={(e) => setExcessShort(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Diff. amount paid by policyholder</Label>
              <Input value={diffAmt} onChange={(e) => setDiffAmt(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Loan & nominee</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Loan taken</Label>
              <Select
                value={loanStatus || "none"}
                onValueChange={(v) => setLoanStatus(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {YES_NO.map((o) => (
                    <SelectItem key={o.value || "n"} value={o.value || "none"}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Loan amount</Label>
              <Input value={loanAmt} onChange={(e) => setLoanAmt(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Nominee name</Label>
              <Input value={nomineeName} onChange={(e) => setNomineeName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nominee relation</Label>
              <Input value={nomineeRelation} onChange={(e) => setNomineeRelation(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address & contact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-3">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address two</Label>
              <Input value={addressTwo} onChange={(e) => setAddressTwo(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address three</Label>
              <Input value={addressThree} onChange={(e) => setAddressThree(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address four</Label>
              <Input value={addressFour} onChange={(e) => setAddressFour(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Area</Label>
              <Input value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Pin code</Label>
              <Input value={pincode} onChange={(e) => setPincode(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Primary mobile</Label>
              <Input value={mobileFirst} onChange={(e) => setMobileFirst(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Secondary mobile</Label>
              <Input value={mobileSecond} onChange={(e) => setMobileSecond(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Refund, CD, courier, meta</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Refund cheque amount</Label>
              <Input value={refundChequeAmt} onChange={(e) => setRefundChequeAmt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Refund cheque no</Label>
              <Input value={refundChequeNo} onChange={(e) => setRefundChequeNo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Refund cheque date</Label>
              <Input type="date" value={refundChequeDate} onChange={(e) => setRefundChequeDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CD account used</Label>
              <Select
                value={cdAccountStatus || "none"}
                onValueChange={(v) => setCdAccountStatus(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YES_NO.map((o) => (
                    <SelectItem key={`cd-${o.value}`} value={o.value || "none"}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>CD amount</Label>
              <Input value={cdAmount} onChange={(e) => setCdAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Courier status (YES/NO)</Label>
              <Select
                value={notCourier || "none"}
                onValueChange={(v) => setNotCourier(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YES_NO.map((o) => (
                    <SelectItem key={`cr-${o.value}`} value={o.value || "none"}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Courier date</Label>
              <Input type="date" value={courierDate} onChange={(e) => setCourierDate(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address for courier</Label>
              <Input value={courierAddress} onChange={(e) => setCourierAddress(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Remark</Label>
              <Input value={remark} onChange={(e) => setRemark(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reference no</Label>
              <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} required className="border-primary" />
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Input value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Month</Label>
              <Input value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Policy grouping</Label>
              <Select
                value={policyGrouping || "none"}
                onValueChange={(v) => setPolicyGrouping((v === "none" ? "" : v) as "" | PolicyGrouping)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUPING.map((g) => (
                    <SelectItem key={g.value || "n"} value={g.value || "none"}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Policy URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={loading} className="min-w-40">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Submit"}
          </Button>
        </div>
      </form>
    </div>
  );
}
