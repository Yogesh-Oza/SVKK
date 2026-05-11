import type { ChartData, PolicyDef } from "./types";

/**
 * Default policy definitions mirroring the reference HTML's `sampleDefs`.
 */
export const SAMPLE_DEFS: Record<string, PolicyDef> = {
  individual: {
    label: "Individual Policy",
    description: "Single chart policy",
    mode: "same",
    discount: {
      type: "count",
      different: "no",
      holder: "",
      member: "",
      daughter: "",
      byCount: { 1: 0, 2: 5, 3: 5, 4: 10, 5: 10, 6: 10, 7: 10 },
    },
  },
  family_floater: {
    label: "Family Floater",
    description: "Single chart policy",
    mode: "same",
    discount: {
      type: "count",
      different: "no",
      holder: "",
      member: "",
      daughter: "",
      byCount: { 1: 0, 2: 5, 3: 5, 4: 10, 5: 10, 6: 10, 7: 10 },
    },
  },
  asha_kiran: {
    label: "Asha Kiran",
    description: "Separate holder and member charts",
    mode: "different",
    discount: {
      type: "daughter",
      different: "no",
      holder: "",
      member: "",
      daughter: 50,
      byCount: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
    },
  },
};

/**
 * Default sample charts mirroring `sampleCharts` from the reference HTML.
 */
export const SAMPLE_CHARTS: Record<string, ChartData> = {
  individual: [
    { label: "0-17", min: 0, max: 17, premiums: { "300000": 2100, "500000": 3200, "1000000": 5700 } },
    { label: "18-35", min: 18, max: 35, premiums: { "300000": 2600, "500000": 3900, "1000000": 6900 } },
    { label: "36-45", min: 36, max: 45, premiums: { "300000": 3700, "500000": 5400, "1000000": 9400 } },
    { label: "46-60", min: 46, max: 60, premiums: { "300000": 5200, "500000": 7600, "1000000": 12900 } },
    { label: "61-100", min: 61, max: 100, premiums: { "300000": 8200, "500000": 11600, "1000000": 18600 } },
  ],
  family_floater: [
    { label: "0-17", min: 0, max: 17, premiums: { "300000": 1800, "500000": 2800, "1000000": 4900 } },
    { label: "18-35", min: 18, max: 35, premiums: { "300000": 2400, "500000": 3500, "1000000": 6200 } },
    { label: "36-45", min: 36, max: 45, premiums: { "300000": 3400, "500000": 4900, "1000000": 8600 } },
    { label: "46-60", min: 46, max: 60, premiums: { "300000": 4700, "500000": 6900, "1000000": 11800 } },
    { label: "61-100", min: 61, max: 100, premiums: { "300000": 7600, "500000": 10800, "1000000": 17300 } },
  ],
  asha_kiran: {
    holder: [
      { label: "18-35", min: 18, max: 35, premiums: { "300000": 2800, "500000": 4100, "1000000": 7200 } },
      { label: "36-45", min: 36, max: 45, premiums: { "300000": 3900, "500000": 5700, "1000000": 9800 } },
      { label: "46-60", min: 46, max: 60, premiums: { "300000": 5600, "500000": 8100, "1000000": 13700 } },
      { label: "61-100", min: 61, max: 100, premiums: { "300000": 8900, "500000": 12500, "1000000": 19800 } },
    ],
    member: [
      { label: "0-17", min: 0, max: 17, premiums: { "300000": 1500, "500000": 2300, "1000000": 4100 } },
      { label: "18-35", min: 18, max: 35, premiums: { "300000": 2100, "500000": 3100, "1000000": 5600 } },
      { label: "36-45", min: 36, max: 45, premiums: { "300000": 3100, "500000": 4500, "1000000": 7900 } },
      { label: "46-60", min: 46, max: 60, premiums: { "300000": 4500, "500000": 6500, "1000000": 11100 } },
      { label: "61-100", min: 61, max: 100, premiums: { "300000": 7100, "500000": 10100, "1000000": 16400 } },
    ],
  },
};
