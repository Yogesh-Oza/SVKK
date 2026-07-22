import { describe, expect, it, vi } from "vitest";
import {
  assertSvkkPublicIdAvailable,
  insuredPartyUniqueConflictMessage,
  normalizeSvkkPublicIdInput,
  svkkPublicIdsEqual,
} from "./insured-party-identity.js";

describe("normalizeSvkkPublicIdInput", () => {
  it("trims and rejects empty", () => {
    expect(normalizeSvkkPublicIdInput("  RTYMAY3042  ")).toBe("RTYMAY3042");
    expect(normalizeSvkkPublicIdInput("")).toBeNull();
    expect(normalizeSvkkPublicIdInput(null)).toBeNull();
  });
});

describe("svkkPublicIdsEqual", () => {
  it("compares case-insensitively", () => {
    expect(svkkPublicIdsEqual("OTHERJUL5334", "otherjul5334")).toBe(true);
    expect(svkkPublicIdsEqual("A", "B")).toBe(false);
  });
});

describe("insuredPartyUniqueConflictMessage", () => {
  it("maps svkkPublicId conflicts clearly", () => {
    expect(insuredPartyUniqueConflictMessage("svkkPublicId")).toBe("SVKK ID already in use");
  });

  it("does not claim mobile or customerId are unique", () => {
    expect(insuredPartyUniqueConflictMessage("mobile")).not.toMatch(/already in use/i);
    expect(insuredPartyUniqueConflictMessage("customerId")).not.toMatch(/already in use/i);
    expect(insuredPartyUniqueConflictMessage("mobile")).toMatch(/migrations/i);
  });
});

describe("assertSvkkPublicIdAvailable", () => {
  it("allows same party on update", async () => {
    const tx = {
      insuredParty: {
        findUnique: vi.fn().mockResolvedValue({ id: "party-1", svkkPublicId: "OTHERJUL5334" }),
      },
    };
    const result = await assertSvkkPublicIdAvailable(tx as never, "OTHERJUL5334", "party-1");
    expect(result.ok).toBe(true);
    expect(tx.insuredParty.findUnique).toHaveBeenCalledWith({
      where: { svkkPublicId: "OTHERJUL5334" },
      select: { id: true, svkkPublicId: true },
    });
  });

  it("rejects when another party owns the svkk id", async () => {
    const tx = {
      insuredParty: {
        findUnique: vi.fn().mockResolvedValue({ id: "party-2", svkkPublicId: "RTYMAY3042" }),
      },
    };
    const result = await assertSvkkPublicIdAvailable(tx as never, "rtymay3042", "party-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.clash.id).toBe("party-2");
    }
  });
});
