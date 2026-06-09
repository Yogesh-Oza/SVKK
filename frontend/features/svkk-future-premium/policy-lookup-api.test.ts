import { describe, expect, it } from "vitest";

import { buildFuturePremiumListQuery } from "./policy-lookup-api";

describe("policy-lookup-api", () => {
  it("builds paginated flat policy list query for future premium", () => {
    const q = buildFuturePremiumListQuery("categoryIds=cat1&villages=Bharudia", 2, 25);
    const params = new URLSearchParams(q);
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("25");
    expect(params.get("sort")).toBe("periodYearText_desc");
    expect(params.get("groupBySvkk")).toBe("false");
    expect(params.get("categoryIds")).toBe("cat1");
    expect(params.get("villages")).toBe("Bharudia");
  });
});
