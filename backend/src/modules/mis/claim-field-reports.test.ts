import { describe, expect, it } from "vitest";
import {
  CLAIM_CSV_PUBLIC_HEADERS,
} from "../claim/claim-csv-format.js";
import {
  CLAIM_CSV_FIELD_META,
  assertClaimCsvFieldMetaAligned,
} from "../claim/claim-csv-field-meta.js";
import {
  buildClaimFieldReports,
  buildClaimFieldReportsCsv,
} from "./claim-field-reports.js";
import type { ClaimFieldReportRow } from "./claim-mis.queries.js";

function utc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d));
}

function baseRow(over: Partial<ClaimFieldReportRow> = {}): ClaimFieldReportRow {
  return {
    category: "D",
    svkkId: "RTYFEB0042",
    policyType: "Family Floater",
    policyGrouping: "RTY",
    insuranceCompany: "The New India Assurance Co. LTD.",
    policyNumber: "PO-14010061252800005144",
    policyStartDate: utc(2026, 3, 15),
    policyEndDate: utc(2027, 3, 14),
    policyHolderName: "Nanji Megji Gala",
    mdId: "MD-RTY0042",
    patientName: "Nanji Megji Gala",
    patientAge: "76",
    patientGender: "M",
    patientRelation: "Self",
    sumInsured: "500000",
    claimNo: "CCN-RTYFEB0042-20260802",
    hospitalName: "Kokilaben Hospital",
    hospitalArea: "Andheri-West",
    treatmentType: "In-Patient",
    illness: "Acute gastritis",
    diseaseCategory: "Diseases of the digestive system",
    admissionDate: utc(2026, 6, 20),
    dischargeDate: utc(2026, 6, 25),
    claimAmount: "45000",
    lodgeDate: utc(2026, 6, 26),
    claimType: "Cashless",
    actualLodgeType: "Cashless",
    deductionAmount: "2000",
    discountAmount: "0",
    deductionDetails: null,
    remark: null,
    approvedAmount: "43000",
    paymentInFavourOf: "The New India Assurance Co. LTD.",
    prsCrsDate: utc(2026, 6, 27),
    paymentDetails: "NEFT/RTY0042",
    paymentDate: utc(2026, 6, 28),
    treatmentProcedure: "In-Patient",
    statusText: "Paid",
    reportedLodgeAmount: "45000",
    ...over,
  };
}

describe("CLAIM_CSV_FIELD_META", () => {
  it("aligns with CLAIM_CSV_PUBLIC_HEADERS order and length", () => {
    expect(() => assertClaimCsvFieldMetaAligned()).not.toThrow();
    expect(CLAIM_CSV_FIELD_META).toHaveLength(39);
    expect(CLAIM_CSV_FIELD_META.map((m) => m.header)).toEqual([...CLAIM_CSV_PUBLIC_HEADERS]);
  });
});

describe("buildClaimFieldReports", () => {
  it("returns exactly 39 cards in canonical order with expected kinds", () => {
    const cards = buildClaimFieldReports([baseRow()]);
    expect(cards).toHaveLength(39);
    expect(cards.map((c) => c.label)).toEqual([...CLAIM_CSV_PUBLIC_HEADERS]);
    expect(cards.map((c) => c.kind)).toEqual(CLAIM_CSV_FIELD_META.map((m) => m.reportKind));
  });

  it("keeps empty canonical fields as cards with No data message", () => {
    const cards = buildClaimFieldReports([baseRow({ remark: null, deductionDetails: null })]);
    const remark = cards.find((c) => c.field === "remark");
    expect(remark?.emptyMessage).toBe("No data in this column");
    expect(remark?.kind).toBe("category");
  });

  it("computes amount sum/avg/min/max for lodge amount", () => {
    const cards = buildClaimFieldReports([baseRow()]);
    const lodge = cards.find((c) => c.field === "claimAmount");
    expect(lodge?.kind).toBe("amount");
    expect(lodge?.summary).toEqual(
      expect.arrayContaining([
        { metric: "Sum", value: 45000 },
        { metric: "Average", value: 45000 },
        { metric: "Maximum", value: 45000 },
        { metric: "Minimum", value: 45000 },
      ]),
    );
  });

  it("computes date earliest/latest", () => {
    const cards = buildClaimFieldReports([baseRow()]);
    const adm = cards.find((c) => c.field === "admissionDate");
    expect(adm?.summary).toEqual(
      expect.arrayContaining([
        { metric: "Earliest", value: "20/06/2026" },
        { metric: "Latest", value: "20/06/2026" },
      ]),
    );
  });

  it("computes identifier unique/filled/empty/duplicates", () => {
    const cards = buildClaimFieldReports([
      baseRow(),
      baseRow({ claimNo: "CCN-DUP", svkkId: "RTYFEB0042" }),
    ]);
    const svkk = cards.find((c) => c.field === "svkkId");
    expect(svkk?.summary).toEqual(
      expect.arrayContaining([
        { metric: "Unique Values", value: 1 },
        { metric: "Filled Rows", value: 2 },
        { metric: "Duplicates", value: 1 },
      ]),
    );
  });

  it("includes lodge and settled on category distribution", () => {
    const cards = buildClaimFieldReports([baseRow()]);
    const status = cards.find((c) => c.field === "statusText");
    expect(status?.distribution?.[0]).toMatchObject({
      label: "Paid",
      count: 1,
      percent: 100,
      lodgeAmount: 45000,
      settledAmount: 43000,
    });
  });

  it("uses linked relational values on the row (caller supplies COALESCE results)", () => {
    const cards = buildClaimFieldReports([
      baseRow({
        policyNumber: "REAL-POLICY",
        svkkId: "REAL-SVKK",
        policyGrouping: "REAL-GROUP",
      }),
    ]);
    expect(cards.find((c) => c.field === "policyNumber")?.summary?.[0]?.value).toBe(1);
    const policyNoId = cards.find((c) => c.field === "policyNumber");
    expect(policyNoId?.filledRows).toBe(1);
  });

  it("truncates category distribution at top 25 and sets truncated flag", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      baseRow({
        claimNo: `CCN-${i}`,
        hospitalName: `Hospital-${i}`,
        claimAmount: "1000",
        approvedAmount: "900",
      }),
    );
    const cards = buildClaimFieldReports(rows);
    const hospital = cards.find((c) => c.field === "hospitalName");
    expect(hospital?.distribution).toHaveLength(25);
    expect(hospital?.truncated).toBe(true);
    expect(hospital?.uniqueCount).toBe(30);
  });

  it("treats Sum Insured as category (HTML colKind parity — name has no amt/amount)", () => {
    const cards = buildClaimFieldReports([baseRow()]);
    const si = cards.find((c) => c.field === "sumInsured");
    expect(si?.kind).toBe("category");
    expect(si?.distribution?.[0]).toMatchObject({
      label: "500000",
      count: 1,
      lodgeAmount: 45000,
      settledAmount: 43000,
    });
  });

  it("builds sectioned CSV for download all", () => {
    const cards = buildClaimFieldReports([baseRow()]);
    const csv = buildClaimFieldReportsCsv(cards);
    expect(csv).toContain("FIELD,Category,kind,category");
    expect(csv).toContain("FIELD,SVKK ID,kind,id");
    expect(csv).toContain("FIELD, Claim Lodge Amt,kind,amount");
    expect(csv).toContain("CLAIM-WISE DETAIL (sorted high to low)");
    expect(csv).toContain("SVKK ID,Patient Name,Policy Number,Claim No,Hospital,Status");
    expect(csv).toContain("FIELD,Sum Insured,kind,category");
  });
});
