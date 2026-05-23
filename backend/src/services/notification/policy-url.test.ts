import { describe, expect, it } from "vitest";
import { normalizeNotificationLinkUrl } from "./policy-url.js";

describe("normalizeNotificationLinkUrl", () => {
  it("rewrites localhost app policy URLs to relative paths", () => {
    expect(
      normalizeNotificationLinkUrl("http://localhost:3000/policies/abc123", "abc123"),
    ).toBe("/policies/abc123");
  });

  it("keeps external document URLs", () => {
    const doc = "https://contoso.sharepoint.com/doc.pdf";
    expect(normalizeNotificationLinkUrl(doc, "abc123")).toBe(doc);
  });

  it("falls back to policy path when link is empty", () => {
    expect(normalizeNotificationLinkUrl(null, "abc123")).toBe("/policies/abc123");
  });
});
