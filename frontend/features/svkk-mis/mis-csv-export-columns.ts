export type MisCsvExportColumn = {
  key: string;
  label: string;
};

export type MisCsvExportColumnGroup = {
  id: string;
  label: string;
  columns: MisCsvExportColumn[];
};

export function allMisExportUiKeys(groups: MisCsvExportColumnGroup[]): string[] {
  return groups.flatMap((group) => group.columns.map((column) => column.key));
}

export const MIS_EXPORT_REPORTS = [
  "policy-member-report",
  "policy-member-report-detail",
  "claim-report",
  "claim-report-detail",
  "claim-category-summary",
] as const;

export type MisExportReport = (typeof MIS_EXPORT_REPORTS)[number];
