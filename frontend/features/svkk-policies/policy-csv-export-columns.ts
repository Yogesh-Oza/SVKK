export type PolicyCsvExportColumn = {
  key: string;
  label: string;
};

export type PolicyCsvExportColumnGroup = {
  id: string;
  label: string;
  columns: PolicyCsvExportColumn[];
};

export function allExportUiKeys(groups: PolicyCsvExportColumnGroup[]): string[] {
  return groups.flatMap((g) => g.columns.map((c) => c.key));
}
