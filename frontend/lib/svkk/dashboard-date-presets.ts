export type DashboardDatePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "thisYear"
  | "all"
  | "custom";

export type DashboardDateRange = {
  dateFrom: string;
  dateTo: string;
  label: string;
};

export const DASHBOARD_DATE_PRESETS: { id: DashboardDatePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "thisMonth", label: "This month" },
  { id: "thisYear", label: "This year" },
  { id: "all", label: "All" },
];

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDays(iso: string, delta: number): string {
  const d = new Date(iso + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function startOfMonthIso(iso: string): string {
  const d = new Date(iso + "T12:00:00.000Z");
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function resolveDashboardDateRange(
  preset: DashboardDatePreset,
  customFrom?: string,
  customTo?: string,
): DashboardDateRange {
  const today = todayIsoDate();
  switch (preset) {
    case "today":
      return { dateFrom: today, dateTo: today, label: "Today" };
    case "yesterday": {
      const y = shiftDays(today, -1);
      return { dateFrom: y, dateTo: y, label: "Yesterday" };
    }
    case "last7":
      return { dateFrom: shiftDays(today, -6), dateTo: today, label: "Last 7 days" };
    case "last30":
      return { dateFrom: shiftDays(today, -29), dateTo: today, label: "Last 30 days" };
    case "thisMonth":
      return { dateFrom: startOfMonthIso(today), dateTo: today, label: "This month" };
    case "thisYear": {
      const y = new Date(today + "T12:00:00.000Z").getUTCFullYear();
      return { dateFrom: `${y}-01-01`, dateTo: today, label: "This year" };
    }
    case "all":
      return { dateFrom: "", dateTo: today, label: "All policies" };
    case "custom":
      return {
        dateFrom: customFrom?.trim() ?? "",
        dateTo: customTo?.trim() || today,
        label: "Custom range",
      };
    default:
      return { dateFrom: "", dateTo: today, label: "All policies" };
  }
}

export function formatRangeSubtitle(range: DashboardDateRange): string {
  if (!range.dateFrom && range.dateTo) {
    return `Through ${formatDmy(range.dateTo)}`;
  }
  if (range.dateFrom === range.dateTo) {
    return formatDmy(range.dateFrom);
  }
  return `${formatDmy(range.dateFrom)} – ${formatDmy(range.dateTo)}`;
}

function formatDmy(iso: string): string {
  const d = new Date(iso + "T12:00:00.000Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}
