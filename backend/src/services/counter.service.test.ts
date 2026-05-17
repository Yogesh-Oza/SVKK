import { describe, expect, it } from "vitest";
import {
  formatPolicyPublicId,
  formatPolicyReferenceNo,
  formatReceiptNo,
  POLICY_SEQUENCE_MIN,
} from "./counter.service.js";

describe("counter.service policy sequence", () => {
  it("uses minimum sequence 3001 for new policies", () => {
    expect(POLICY_SEQUENCE_MIN).toBe(3001);
  });

  it("formats SVKK public id suffix from sequence", () => {
    expect(formatPolicyPublicId("RTY", "May", 3001)).toBe("rtymay3001");
    expect(formatPolicyPublicId("RTY", "May", 1)).toBe("rtymay0001");
  });

  it("formats reference no suffix from sequence", () => {
    expect(formatPolicyReferenceNo("RTY", "2026", "May", 3001)).toBe("rty2026may3001");
  });

  it("formats receipt no in legacy MIS style", () => {
    expect(formatReceiptNo("2025", 94100)).toBe("RCP/2025/94100");
    expect(formatReceiptNo("2026", 1)).toBe("RCP/2026/00001");
  });
});
