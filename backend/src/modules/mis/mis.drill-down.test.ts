import { describe, expect, it } from "vitest";
import { resolveDrillCategoryKeys } from "./mis.service.js";
import { UNCATEGORIZED_CATEGORY_KEY } from "./mis.queries.js";

describe("resolveDrillCategoryKeys", () => {
  it("orders preferred keys first then extras and uncategorized last", () => {
    const keys = resolveDrillCategoryKeys(
      ["d", "asha_kiran_cat", "a", UNCATEGORIZED_CATEGORY_KEY, "e"],
      [],
    );
    expect(keys).toEqual(["a", "d", "asha_kiran_cat", "e", UNCATEGORIZED_CATEGORY_KEY]);
  });

  it("respects user category filter tokens", () => {
    const keys = resolveDrillCategoryKeys(
      ["a", "b", "asha_kiran_cat", "d"],
      ["A", "D"],
    );
    expect(keys).toEqual(["a", "d"]);
  });

  it("includes asha_kiran_cat when present so drill totals match main row", () => {
    const keys = resolveDrillCategoryKeys(["a", "b", "asha_kiran_cat"], []);
    expect(keys).toContain("asha_kiran_cat");
  });
});
