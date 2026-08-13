import { describe, expect, it } from "vitest";
import {
  computeWalletCdPreview,
  effectiveCdFromForm,
  savedCdFieldsFromPolicy,
} from "./policy-wallet-preview";

describe("effectiveCdFromForm", () => {
  it("returns 0 when CD account is not YES", () => {
    expect(effectiveCdFromForm("NO", "10000")).toBe(0);
    expect(effectiveCdFromForm("", "10000")).toBe(0);
  });

  it("returns amount when CD account is YES", () => {
    expect(effectiveCdFromForm("YES", "20,000")).toBe(20000);
  });
});

describe("computeWalletCdPreview", () => {
  it("deducts full CD on create", () => {
    const preview = computeWalletCdPreview({
      walletBalance: "45000",
      savedCdAccountStatus: "",
      savedCdAmount: "",
      cdAccountStatus: "YES",
      cdAmount: "20000",
    });
    expect(preview.cdDelta).toBe(20000);
    expect(preview.projectedBalance).toBe(25000);
    expect(preview.wouldGoNegative).toBe(false);
  });

  it("uses delta on edit when CD amount increases", () => {
    const preview = computeWalletCdPreview({
      walletBalance: "45000",
      savedCdAccountStatus: "YES",
      savedCdAmount: "10000",
      cdAccountStatus: "YES",
      cdAmount: "20000",
    });
    expect(preview.cdDelta).toBe(10000);
    expect(preview.projectedBalance).toBe(35000);
  });

  it("refunds delta when CD amount decreases", () => {
    const preview = computeWalletCdPreview({
      walletBalance: "45000",
      savedCdAccountStatus: "YES",
      savedCdAmount: "20000",
      cdAccountStatus: "YES",
      cdAmount: "10000",
    });
    expect(preview.cdDelta).toBe(-10000);
    expect(preview.projectedBalance).toBe(55000);
  });

  it("flags negative projected balance", () => {
    const preview = computeWalletCdPreview({
      walletBalance: "45000",
      savedCdAccountStatus: "YES",
      savedCdAmount: "10000",
      cdAccountStatus: "YES",
      cdAmount: "60000",
    });
    expect(preview.projectedBalance).toBe(-5000);
    expect(preview.wouldGoNegative).toBe(true);
  });

  it("does not warn when wallet is negative but CD is unchanged", () => {
    const preview = computeWalletCdPreview({
      walletBalance: "-36089",
      savedCdAccountStatus: "YES",
      savedCdAmount: "22727",
      cdAccountStatus: "YES",
      cdAmount: "22727",
    });
    expect(preview.cdDelta).toBe(0);
    expect(preview.projectedBalance).toBe(-36089);
    expect(preview.wouldGoNegative).toBe(false);
  });

  it("accepts saved CD fields spread from savedCdFieldsFromPolicy", () => {
    const saved = savedCdFieldsFromPolicy({
      cdAccountUsed: true,
      cdAmount: 10000,
    } as Parameters<typeof savedCdFieldsFromPolicy>[0]);
    const preview = computeWalletCdPreview({
      walletBalance: "45000",
      ...saved,
      cdAccountStatus: "YES",
      cdAmount: "20000",
    });
    expect(saved).toEqual({
      savedCdAccountStatus: "YES",
      savedCdAmount: "10000",
    });
    expect(preview.cdDelta).toBe(10000);
    expect(preview.projectedBalance).toBe(35000);
  });
});
