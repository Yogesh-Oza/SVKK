import { describe, expect, it } from "vitest";
import {
  buildCategoryByKeyMap,
  formatCategoryLabel,
  resolveCategoryFromInput,
  resolveCategoryRef,
} from "./category-display.js";

const ROWS = [
  { id: "1", key: "d", name: "Category D" },
  { id: "2", key: "a", name: "Category A" },
];
const LOOKUP = buildCategoryByKeyMap(ROWS);

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

  it("resolves categoryText display name for list/MIS display", () => {
    expect(resolveCategoryRef(null, "Category D", LOOKUP)).toEqual(ROWS[0]);
  });

  it("resolveCategoryFromInput accepts key, name, and category-prefixed text", () => {
    expect(resolveCategoryFromInput("A", ROWS)?.id).toBe("2");
    expect(resolveCategoryFromInput("category d", ROWS)?.id).toBe("1");
    expect(resolveCategoryFromInput("Category D", ROWS)?.id).toBe("1");
    expect(resolveCategoryFromInput("unknown", ROWS)).toBeNull();
    expect(resolveCategoryFromInput("", ROWS)).toBeNull();
  });
});
