import { describe, expect, it } from "vitest";
import {
  generateOfflineTempSvkkPublicId,
  isProvisionalSvkkPublicId,
  OFFLINE_TEMP_SVKK_PREFIX,
  prepareOfflineCreatePayloadForSync,
} from "./offline-svkk-id";

describe("offline-svkk-id", () => {
  it("generates unique TEMP- prefixed IDs", () => {
    const a = generateOfflineTempSvkkPublicId();
    const b = generateOfflineTempSvkkPublicId();
    expect(a).toMatch(/^TEMP-[A-Z0-9]+$/);
    expect(b).toMatch(/^TEMP-[A-Z0-9]+$/);
    expect(a).not.toBe(b);
    expect(a.startsWith(OFFLINE_TEMP_SVKK_PREFIX)).toBe(true);
  });

  it("detects provisional TEMP- and legacy 0000 placeholders", () => {
    expect(isProvisionalSvkkPublicId("TEMP-ABC12345")).toBe(true);
    expect(isProvisionalSvkkPublicId("OTHERJUN0000")).toBe(true);
    expect(isProvisionalSvkkPublicId("RTYMAY3042")).toBe(false);
    expect(isProvisionalSvkkPublicId("")).toBe(false);
  });

  it("strips provisional svkkPublicId from sync payload", () => {
    const prepared = prepareOfflineCreatePayloadForSync({
      partyName: "Test Holder",
      svkkPublicId: "TEMP-XYZ12345",
      referenceNo: "OTHER2026JUN3001",
      _offlineProvisionalSvkkId: true,
    });
    expect(prepared.svkkPublicId).toBeUndefined();
    expect(prepared._offlineProvisionalSvkkId).toBeUndefined();
    expect(prepared.referenceNo).toBe("OTHER2026JUN3001");
    expect(prepared.partyName).toBe("Test Holder");
  });

  it("keeps real svkkPublicId on carry-forward sync", () => {
    const prepared = prepareOfflineCreatePayloadForSync({
      svkkPublicId: "RTYMAY3042",
      referenceNo: "OTHER2026JUN3002",
    });
    expect(prepared.svkkPublicId).toBe("RTYMAY3042");
  });
});
