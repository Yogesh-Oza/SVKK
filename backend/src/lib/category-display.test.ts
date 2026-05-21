import { describe, expect, it } from "vitest";
import {
  buildCategoryByKeyMap,
  formatCategoryLabel,
  resolveCategoryRef,
} from "./category-display.js";

const LOOKUP = buildCategoryByKeyMap([
  { id: "1", key: "d", name: "Category D" },
  { id: "2", key: "a", name: "Category A" },
]);

describe("category-display", () => {
  it("resolves legacy categoryText key to full category row", () => {
    expect(resolveCategoryRef(null, "D", LOOKUP)).toEqual({
      id: "1",
      key: "d",
      name: "Category D",
    });
  });

  it("prefers linked category name from lookup when key matches", () => {
    expect(
      formatCategoryLabel({ id: "1", key: "d", name: "Category D" }, "d", LOOKUP),
    ).toBe("Category D");
  });

  it("falls back to categoryText when key is unknown", () => {
    expect(formatCategoryLabel(null, "legacy", LOOKUP)).toBe("legacy");
  });
});
