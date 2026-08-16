import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ClaimLinkMode, ClaimPolicyMatchStatus, CsvImportMode } from "@prisma/client";
import { DEFAULT_CLAIM_STATUS_MAP } from "./claim-status-map.js";
import { parseClaimRow, validateClaimRow, claimEventIdentityFromRow } from "./claim-csv-import.js";
import {
  decidePerRowClaimPreview,
  groupParsedClaimRows,
  pickCanonicalClaimRow,
  primaryLodgePriority,
  type ExistingClaimIdentity,
} from "./claim-csv-group.js";
import { claimEventKeyFromRow } from "./claim-event-key.js";
import {
  resolveClaimPolicyMatch,
  type ClaimMatchInput,
  type ClaimMatchResult,
  type PolicyMatchCandidate,
} from "./claim-policy-match.js";
import type { PolicyTypeCache } from "../policy/policy-csv-resolve.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function emptyTypeCache(): PolicyTypeCache {
  return {
    types: [],
    byKey: new Map(),
    byKeyNormalized: new Map(),
    byNameNormalized: new Map(),
    aliasToKey: new Map(),
    allowedLabels: () => "",
    fuzzyMatch: () => [],
  };
}

function makePolicy(id: string, policyNo: string): PolicyMatchCandidate {
  return {
    id,
    policyNo,
    village: "V1",
    area: "A1",
    insuranceCompany: null,
    holderName: "Holder",
    insuredPartyId: `party-${id}`,
    insuredParty: { id: `party-${id}`, svkkPublicId: `SVKK-${id}`, name: "Holder" },
    policyType: { id: "pt-1", key: "floater", name: "Floater" },
    policyGrouping: null,
    categoryText: null,
    years: [],
  };
}

function rowMap(over: Record<string, string>): Map<string, string> {
  const base: Record<string, string> = {
    "Claim Number": "CCN-001",
    "Policy Number": "PO-001",
    "Policy Holder Name": "Holder",
    "Date Of Admission": "01-06-2025",
    "Claim Lodge Date": "05-06-2025",
    "Claim Type": "Non Cash Less",
    "Actual Lodge Type": "Non Cash Less",
    "Claim Amount": "50000",
  };
  return new Map(Object.entries({ ...base, ...over }));
}

function parsed(rowNumber: number, over: Record<string, string> = {}) {
  return parseClaimRow(rowNumber, rowMap(over), DEFAULT_CLAIM_STATUS_MAP);
}

function matched(policyId: string): ClaimMatchResult {
  return {
    matchStatus: ClaimPolicyMatchStatus.MATCHED_EXACT,
    verificationWarnings: [],
    matchReason: "MATCHED — Policy Number PO-001",
    policyId,
  };
}

function conflictMatch(): ClaimMatchResult {
  return {
    matchStatus: ClaimPolicyMatchStatus.CONFLICT,
    verificationWarnings: [],
    matchReason: "CONFLICT — Policy Number matches multiple live policies. Claim cannot be linked safely.",
    conflictDetail: "2 live policies share Policy Number PO-001",
  };
}

function unlinkedMatch(): ClaimMatchResult {
  return {
    matchStatus: ClaimPolicyMatchStatus.UNLINKED,
    verificationWarnings: [],
    matchReason: "UNLINKED — No policy found for this Policy Number.",
  };
}

function previewOf(
  rows: ReturnType<typeof parsed>[],
  match: ClaimMatchResult,
  existingByKey: Map<string, ExistingClaimIdentity> = new Map(),
  linkMode: ClaimLinkMode = ClaimLinkMode.STRICT_MATCH,
) {
  const matchByRow = new Map<number, ClaimMatchResult>();
  for (const row of rows) matchByRow.set(row.rowNumber, match);
  return decidePerRowClaimPreview({
    rows,
    matchByRow,
    existingByKey,
    linkMode,
    importMode: CsvImportMode.CREATE_ONLY,
    validateRow: validateClaimRow,
    identityFromRow: claimEventIdentityFromRow,
    sourceKeyFromRow: claimEventKeyFromRow,
  });
}

function ident(over: Partial<ExistingClaimIdentity> = {}): ExistingClaimIdentity {
  return {
    claimNo: "CCN-001",
    policyId: "pol-1",
    policyNo: "PO-001",
    admissionDate: utc(2025, 6, 1),
    lodgeDate: utc(2025, 6, 5),
    claimReceivedDate: null,
    actualLodgeType: "Non Cash Less",
    claimType: "Non Cash Less",
    ...over,
  };
}

describe("schema: one policy, many claims", () => {
  it("Claim.claimNo is indexed and sourceEventKey is unique", () => {
    const schema = readFileSync(join(__dirname, "../../../prisma/schema.prisma"), "utf8");
    const start = schema.indexOf("model Claim {");
    const end = schema.indexOf("\nmodel ", start + 1);
    const claimModel = schema.slice(start, end === -1 ? undefined : end);
    expect(claimModel).not.toMatch(/claimNo\s+String\s+@unique/);
    expect(claimModel).toMatch(/@@index\(\[claimNo\]\)/);
    expect(claimModel).toMatch(/sourceEventKey\s+String\?\s+@unique/);
    expect(claimModel).not.toMatch(/policyId\s+String\??\s+@unique/);
    expect(claimModel).toMatch(/@@index\(\[policyId\]\)/);
    expect(schema).toMatch(/model ClaimEvent/);
    expect(schema).toMatch(/eventKey\s+String\s+@unique/);
  });
});

describe("primaryLodgePriority", () => {
  it("ranks original lodge above payment stages", () => {
    expect(primaryLodgePriority("Non Cash Less")).toBeLessThan(primaryLodgePriority("Additional Payment"));
    expect(primaryLodgePriority("Cash Less")).toBeLessThan(primaryLodgePriority("Deductions Payment"));
    expect(primaryLodgePriority("Additional Payment")).toBeLessThan(primaryLodgePriority("CI Received"));
  });
});

describe("groupParsedClaimRows", () => {
  it("keeps different Claim Numbers as separate claims on the same policy", () => {
    const groups = groupParsedClaimRows([
      parsed(2, { "Claim Number": "CCN-001" }),
      parsed(3, { "Claim Number": "CCN-002" }),
      parsed(4, { "Claim Number": "CCN-003" }),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.claimNo).sort()).toEqual(["CCN-001", "CCN-002", "CCN-003"]);
  });

  it("collapses TPA payment rows with the same CCN into one claim", () => {
    const groups = groupParsedClaimRows([
      parsed(2, { "Claim Number": "CCN-001", "Claim Type": "Additional Payment", "Claim Amount": "600" }),
      parsed(3, { "Claim Number": "CCN-001", "Claim Type": "Non Cash Less", "Claim Amount": "50008" }),
      parsed(4, { "Claim Number": "CCN-001", "Claim Type": "Deductions Payment", "Claim Amount": "10824" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.sameEventRows).toHaveLength(2);
    expect(groups[0]!.differentEventRows).toHaveLength(0);
    expect(pickCanonicalClaimRow(groups[0]!.rows).claimType).toBe("Non Cash Less");
    expect(pickCanonicalClaimRow(groups[0]!.rows).claimAmount).toBe(50008);
  });
});

describe("acceptance: claim CSV grouping + policy link", () => {
  it("Test 1 — one policy, many claims → 3 creates, no conflict", () => {
    const policy = makePolicy("pol-1", "PO-001");
    const input: ClaimMatchInput = {
      policyNo: "PO-001",
      svkkPublicId: "",
      policyHolderName: "",
      policyTypeText: "",
      policyStartDate: null,
      policyEndDate: null,
      sumInsured: null,
      insuranceCompany: null,
      admissionDate: null,
      lodgeDate: null,
      claimReceivedDate: null,
    };
    expect(resolveClaimPolicyMatch([policy], input, emptyTypeCache()).matchStatus).toBe(
      ClaimPolicyMatchStatus.MATCHED_EXACT,
    );

    const { stats } = previewOf(
      [
        parsed(2, { "Claim Number": "CCN-001" }),
        parsed(3, { "Claim Number": "CCN-002" }),
        parsed(4, { "Claim Number": "CCN-003" }),
      ],
      matched("pol-1"),
    );
    expect(stats.uniqueClaims).toBe(3);
    expect(stats.willCreate).toBe(3);
    expect(stats.conflicts).toBe(0);
    expect(stats.willReject).toBe(0);
    expect(stats.sameCcnExtraRows).toBe(0);
  });

  it("Test 2 — same CCN payment rows → 3 claims", () => {
    const { stats, preview } = previewOf(
      [
        parsed(2, { "Claim Type": "Non Cash Less", "Claim Amount": "50008" }),
        parsed(3, { "Claim Type": "Additional Payment", "Claim Amount": "600" }),
        parsed(4, { "Claim Type": "Deductions Payment", "Claim Amount": "10824" }),
      ],
      matched("pol-1"),
    );
    expect(stats.uniqueClaims).toBe(3);
    expect(stats.willCreate).toBe(3);
    expect(stats.sameCcnExtraRows).toBe(2);
    expect(stats.totalRows).toBe(3);
    expect(preview.filter((p) => p.decision.disposition === "WILL_CREATE")).toHaveLength(3);
    expect(preview.filter((p) => p.decision.disposition === "WILL_REJECT")).toHaveLength(0);
  });

  it("Test 3 — duplicate policy number → Conflict", () => {
    const a = makePolicy("pol-a", "PO-001");
    const b = makePolicy("pol-b", "PO-001");
    const r = resolveClaimPolicyMatch(
      [a, b],
      {
        policyNo: "PO-001",
        svkkPublicId: "",
        policyHolderName: "",
        policyTypeText: "",
        policyStartDate: null,
        policyEndDate: null,
        sumInsured: null,
        insuranceCompany: null,
        admissionDate: null,
        lodgeDate: null,
        claimReceivedDate: null,
      },
      emptyTypeCache(),
    );
    expect(r.matchStatus).toBe(ClaimPolicyMatchStatus.CONFLICT);
    expect(r.matchReason).toContain("Policy Number matches multiple live policies");

    const { stats, preview } = previewOf([parsed(2)], conflictMatch());
    expect(stats.conflicts).toBe(1);
    expect(stats.willReject).toBe(1);
    expect(stats.willCreate).toBe(0);
    expect(preview[0]!.decision.dispositionReason).toBe("conflict");
  });

  it("Test 4 — policy does not exist → Unlinked", () => {
    const { stats, preview } = previewOf(
      [parsed(2, { "Policy Number": "PO-999", "Claim Number": "CCN-001" })],
      unlinkedMatch(),
    );
    expect(stats.unlinked).toBe(1);
    expect(stats.willReject).toBe(1);
    expect(preview[0]!.decision.dispositionReason).toBe("unlinked");
  });

  it("Test 5 — existing sourceEventKey → update, no duplicate create", () => {
    const row = parsed(2);
    const existing = new Map([[claimEventKeyFromRow(row), ident()]]);
    const { stats } = previewOf([row], matched("pol-1"), existing);
    expect(stats.willCreate).toBe(0);
    expect(stats.willUpdate).toBe(1);
    expect(stats.uniqueClaims).toBe(1);
  });

  it("Test 5b — same CCN with a new payment identity → create", () => {
    const existingRow = parsed(2, { "Claim Type": "Non Cash Less", "Claim Amount": "50008" });
    const incoming = parsed(3, { "Claim Type": "Additional Payment", "Claim Amount": "600" });
    const existing = new Map([[claimEventKeyFromRow(existingRow), ident()]]);
    const { stats } = previewOf([incoming], matched("pol-1"), existing);
    expect(stats.willCreate).toBe(1);
    expect(stats.willUpdate).toBe(0);
  });

  it("Test 6 — same policy, different CCN → create, no conflict", () => {
    const existingRow = parsed(2, { "Claim Number": "CCN-001" });
    const existing = new Map([[claimEventKeyFromRow(existingRow), ident()]]);
    const { stats } = previewOf(
      [parsed(2, { "Claim Number": "CCN-002" })],
      matched("pol-1"),
      existing,
    );
    expect(stats.willCreate).toBe(1);
    expect(stats.conflicts).toBe(0);
    expect(stats.willReject).toBe(0);
  });

  it("treats CI Received with a different admission date as the same CCN", () => {
    const groups = groupParsedClaimRows([
      parsed(2, {
        "Claim Number": "CCN-001",
        "Claim Type": "Non Cash Less",
        "Date Of Admission": "18-07-2025",
      }),
      parsed(3, {
        "Claim Number": "CCN-001",
        "Claim Type": "CI Received",
        "Date Of Admission": "01-08-2025",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.differentEventRows).toHaveLength(0);
    expect(groups[0]!.sameEventRows).toHaveLength(1);
  });

  it("treats Additional/Deduction lodge types as separate claims on the same CCN", () => {
    const existingRow = parsed(2, { "Claim Type": "Non Cash Less", "Claim Amount": "50008" });
    const existing = new Map([[claimEventKeyFromRow(existingRow), ident()]]);
    const { stats, preview } = previewOf(
      [
        parsed(2, { "Claim Type": "Additional Payment", "Claim Amount": "600" }),
        parsed(3, { "Claim Type": "Non Cash Less", "Claim Amount": "50008" }),
      ],
      matched("pol-1"),
      existing,
    );
    expect(stats.uniqueClaims).toBe(2);
    expect(stats.willCreate).toBe(1);
    expect(stats.willUpdate).toBe(1);
    expect(preview.every((p) => p.decision.disposition !== "WILL_REJECT")).toBe(true);
  });

  it("Test 7 — same CCN with different admission creates two claims", () => {
    const { stats, preview } = previewOf(
      [
        parsed(2, {
          "Claim Number": "CCN-001",
          "Claim Type": "Non Cash Less",
          "Date Of Admission": "01-01-2026",
        }),
        parsed(3, {
          "Claim Number": "CCN-001",
          "Claim Type": "Non Cash Less",
          "Date Of Admission": "15-02-2026",
        }),
      ],
      matched("pol-1"),
    );
    expect(stats.uniqueClaims).toBe(2);
    expect(stats.willCreate).toBe(2);
    expect(stats.willReject).toBe(0);
    expect(preview.filter((p) => p.decision.disposition === "WILL_CREATE")).toHaveLength(2);
  });

  it("Test 8 — missing policy + Strict Match rejects the claim", () => {
    const { stats, preview } = previewOf(
      [parsed(2, { "Policy Number": "PO-999", "Claim Number": "CCN-001" })],
      unlinkedMatch(),
      new Map(),
      ClaimLinkMode.STRICT_MATCH,
    );
    expect(stats.unlinked).toBe(1);
    expect(stats.willReject).toBe(1);
    expect(stats.willCreate).toBe(0);
    expect(preview[0]!.decision.dispositionReason).toBe("unlinked");
  });

  it("keeps five TPA rows for one CCN as five claims", () => {
    const { stats, preview } = previewOf(
      [
        parsed(282, { "Claim Number": "MDI9918783", "Claim Type": "Non Cash Less", "Claim Amount": "50000" }),
        parsed(508, { "Claim Number": "MDI9918783", "Claim Type": "Additional Payment", "Claim Amount": "5000" }),
        parsed(628, { "Claim Number": "MDI9918783", "Claim Type": "Deductions Payment", "Claim Amount": "2000" }),
        parsed(629, { "Claim Number": "MDI9918783", "Claim Type": "CI Received", "Claim Amount": "0" }),
        parsed(878, { "Claim Number": "MDI9918783", "Claim Type": "Reconsideration", "Claim Amount": "1000" }),
      ],
      matched("pol-1"),
    );
    expect(stats.uniqueClaims).toBe(5);
    expect(stats.totalRows).toBe(5);
    expect(stats.willCreate).toBe(5);
    expect(stats.sameCcnExtraRows).toBe(4);
    expect(preview.every((p) => p.decision.disposition === "WILL_CREATE")).toBe(true);

    const sameFileAgain = previewOf(
      preview.map((p) => p.row),
      matched("pol-1"),
      new Map(preview.map((p) => [claimEventKeyFromRow(p.row), ident({ claimNo: p.row.claimNo })])),
    );
    expect(sameFileAgain.stats.willCreate).toBe(0);
    expect(sameFileAgain.stats.willUpdate).toBe(5);
  });

  it("Test 9 — missing policy + Allow Unlinked creates with no policy link", () => {
    const { stats, preview } = previewOf(
      [parsed(2, { "Policy Number": "PO-999", "Claim Number": "CCN-001" })],
      unlinkedMatch(),
      new Map(),
      ClaimLinkMode.ALLOW_UNLINKED,
    );
    expect(stats.unlinked).toBe(1);
    expect(stats.willCreate).toBe(1);
    expect(stats.willReject).toBe(0);
    expect(preview[0]!.decision.disposition).toBe("WILL_CREATE");
    expect(preview[0]!.row.policyNo).toBe("PO-999");
  });
});
