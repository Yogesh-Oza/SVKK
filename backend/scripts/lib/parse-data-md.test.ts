import { describe, expect, it } from "vitest";
import { parseDataMd } from "./parse-data-md.js";

const SAMPLE = `Area
C.P. Tank
Andheri-East

Village
Bhachau
Samkhiyali
`;

describe("parseDataMd", () => {
  it("splits area and village sections", () => {
    const p = parseDataMd(SAMPLE);
    expect(p.areas).toEqual(["C.P. Tank", "Andheri-East"]);
    expect(p.villages).toEqual(["Bhachau", "Samkhiyali"]);
  });
});
