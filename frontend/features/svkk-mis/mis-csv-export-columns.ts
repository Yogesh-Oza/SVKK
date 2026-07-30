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

const POLICY_MEMBER_COLUMNS: MisCsvExportColumn[] = [
  { key: "label", label: "Type of PO" },
  { key: "totalPolicies", label: "Total policies" },
  { key: "membersPlusPolicies", label: "Members + policies" },
  { key: "cntAshaKiran", label: "Asha-kiran" },
  { key: "cntFamilyFloater", label: "Family-floating" },
  { key: "cntIndividual", label: "Individual" },
  { key: "sumVkk", label: "Total VKK premium" },
  { key: "sumCo", label: "Co premium" },
  { key: "sumGross", label: "Gross premium" },
  { key: "sumComm", label: "Commission" },
  { key: "sumTwoLac", label: "Two lakh F" },
  { key: "sumPolHolder", label: "Policy holder premium" },
  { key: "sumGaam", label: "Gaam Mahajan VKK refund" },
  { key: "sumRefund", label: "Refund cheque amt" },
  { key: "sumCd", label: "CD amount" },
  { key: "age0_18", label: "Age 0-18" },
  { key: "age19_35", label: "Age 19-35" },
  { key: "age36_45", label: "Age 36-45" },
  { key: "age46_50", label: "Age 46-50" },
  { key: "age51_55", label: "Age 51-55" },
  { key: "age56_60", label: "Age 56-60" },
  { key: "age61_65", label: "Age 61-65" },
  { key: "age65p", label: "Age >65" },
  { key: "totalAgeCount", label: "Total age count" },
];

const CLAIM_REPORT_COLUMNS: MisCsvExportColumn[] = [
  { key: "label", label: "Group label" },
  { key: "claimCount", label: "Claims" },
  { key: "sumClaimAmount", label: "Claim amount" },
  { key: "sumApprovedAmount", label: "Approved amount" },
  { key: "sumDeductionAmount", label: "Deduction amount" },
];

const CLAIM_CATEGORY_SUMMARY_COLUMNS: MisCsvExportColumn[] = [
  { key: "category", label: "Category" },
  { key: "cashNo", label: "Cash No" },
  { key: "cashLodge", label: "Cash Lodge" },
  { key: "cashSettled", label: "Cash Settled" },
  { key: "reimNo", label: "Reim No" },
  { key: "reimLodge", label: "Reim Lodge" },
  { key: "reimSettled", label: "Reim Settled" },
  { key: "cashDeniedNo", label: "Cash Denied No" },
  { key: "cashDeniedLodge", label: "Cash Denied Lodge" },
  { key: "remDeniedNo", label: "REM Denied No" },
  { key: "remDeniedLodge", label: "REM Denied Lodge" },
  { key: "totalNo", label: "Total" },
  { key: "totalLodge", label: "Total Lodge" },
  { key: "totalSettled", label: "Total Settled" },
];

const MIS_EXPORT_COLUMN_GROUPS: Record<MisExportReport, MisCsvExportColumnGroup[]> = {
  "policy-member-report": [
    { id: "policy-metrics", label: "Policy MIS metrics", columns: POLICY_MEMBER_COLUMNS },
  ],
  "policy-member-report-detail": [
    { id: "policy-detail-metrics", label: "Policy MIS detail metrics", columns: POLICY_MEMBER_COLUMNS },
  ],
  "claim-report": [
    { id: "claim-metrics", label: "Claim MIS metrics", columns: CLAIM_REPORT_COLUMNS },
  ],
  "claim-report-detail": [
    { id: "claim-detail-metrics", label: "Claim MIS detail metrics", columns: CLAIM_REPORT_COLUMNS },
  ],
  "claim-category-summary": [
    { id: "claim-category-summary", label: "Claim category summary", columns: CLAIM_CATEGORY_SUMMARY_COLUMNS },
  ],
};

export function buildMisExportColumnGroups(report: MisExportReport): MisCsvExportColumnGroup[] {
  return MIS_EXPORT_COLUMN_GROUPS[report];
}
