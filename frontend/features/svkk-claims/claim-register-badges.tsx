import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const v = (value ?? "").toLowerCase();
  if (!v) return <span className="text-muted-foreground">—</span>;
  if (v.includes("paid") || v.includes("settled")) {
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{value}</Badge>;
  }
  if (v.includes("reject") || v.includes("close") || v.includes("repudiat") || v.includes("denied")) {
    return <Badge variant="destructive">{value}</Badge>;
  }
  if (v.includes("process") || v.includes("pending") || v.includes("under")) {
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">{value}</Badge>;
  }
  if (v.includes("received") || v.includes("issued") || v.includes("intimat")) {
    return <Badge className="bg-blue-100 text-blue-900 hover:bg-blue-100">{value}</Badge>;
  }
  return <Badge variant="secondary">{value}</Badge>;
}

export function LodgeTypeBadge({ value }: { value: string | null | undefined }) {
  const v = (value ?? "").toLowerCase();
  if (!v) return <span className="text-muted-foreground">—</span>;
  const isNonCash = v.includes("non cash") || v.includes("non-cash");
  if (isNonCash) {
    // Reimbursement ("Non Cash Less") — must not be styled as cashless.
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">{value}</Badge>;
  }
  if (v.includes("cashless") || v.includes("cash less")) {
    return <Badge className="bg-blue-100 text-blue-900 hover:bg-blue-100">{value}</Badge>;
  }
  return <Badge variant="outline">{value}</Badge>;
}

export function CategoryBadge({ value }: { value: string | null | undefined }) {
  const key = (value ?? "").trim().toLowerCase();
  const colors: Record<string, string> = {
    a: "bg-emerald-100 text-emerald-800",
    b: "bg-blue-100 text-blue-900",
    c: "bg-amber-100 text-amber-900",
    d: "bg-red-100 text-red-900",
  };
  if (!key) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge className={cn("hover:opacity-90", colors[key] ?? "bg-muted text-muted-foreground")}>
      {value}
    </Badge>
  );
}

export function formatInrCompact(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "₹0";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatInrRupee(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatDateCell(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${m}-${d.getUTCFullYear()}`;
}
