# Premium rules (Phase 1)

## Age

- **Completed age** on **policy end date** (not “today”).

## Charts

- `ChartMode.SINGLE`: one matrix (`PolicyChartKind.COMBINED` or `HOLDER` as primary).
- `ChartMode.HOLDER_MEMBER`: **holder** chart + **member** chart share same `policyTypeId` + `version`; `PolicyYear` references the **holder** row; engine loads **member** sibling by version.

## Holder selection

- **Oldest non-daughter** by completed age gets **holder** chart; others use **member** chart.
- If everyone is labeled daughter, oldest uses holder chart (edge case).

## Daughter discount

- Optional `daughterDiscountPercent` in chart JSON (e.g. `50`) applied to **gross** for that row.

## Matrix JSON shape

```json
{
  "bands": [{ "label": "36-45", "minAge": 36, "maxAge": 45 }],
  "siColumns": [300000, 500000, 1000000],
  "matrix": [[...]],
  "daughterDiscountPercent": 50
}
```
