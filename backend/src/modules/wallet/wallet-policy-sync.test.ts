import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { cdDelta, effectiveCdAmount } from "./wallet-policy-sync.js";

describe("wallet-policy-sync math", () => {
  it("effectiveCd is 0 when cdAccountUsed is not true", () => {
    expect(effectiveCdAmount({ cdAccountUsed: false, cdAmount: 1000 }).toString()).toBe("0");
    expect(effectiveCdAmount({ cdAccountUsed: null, cdAmount: 1000 }).toString()).toBe("0");
    expect(effectiveCdAmount({ cdAccountUsed: true, cdAmount: 0 }).toString()).toBe("0");
  });

  it("effectiveCd returns amount when used", () => {
    expect(effectiveCdAmount({ cdAccountUsed: true, cdAmount: 1500 }).toString()).toBe("1500");
  });

  it("delta 1000 → 1500 is +500", () => {
    const d = cdDelta(new Prisma.Decimal(1000), new Prisma.Decimal(1500));
    expect(d.toString()).toBe("500");
  });

  it("delta 1500 → 1000 is -500", () => {
    const d = cdDelta(new Prisma.Decimal(1500), new Prisma.Decimal(1000));
    expect(d.toString()).toBe("-500");
  });

  it("delta equal is 0", () => {
    expect(cdDelta(new Prisma.Decimal(1000), new Prisma.Decimal(1000)).toString()).toBe("0");
  });
});
