# Identity & mobile normalization (Phase 1)

## Canonical mobile format

- Stored as **E.164**, e.g. `+919876543210`.
- **Default country**: India `+91`.

## Algorithm (`normalizeMobile`)

1. Trim and remove spaces, dashes, parentheses.
2. Strip leading `+` for digit analysis.
3. If **10 digits** → prepend country code `91` → `+91` + digits.
4. If **12 digits** starting with `91` → `+` + digits.
5. Otherwise if length 11–15 and all digits → `+` + digits.
6. Else reject with `INVALID_MOBILE`.

## Examples

| Input        | Output           |
| ------------ | ---------------- |
| `9876543210` | `+919876543210` |
| `+919876543210` | `+919876543210` |

## Operational rules

- **Mobile is not unique.** Multiple insured parties / policies may share the same number (e.g. family phones).
- **Identity for renewals / carry-forward** is `svkkPublicId` only (unique). Do not match or merge holders by mobile.
- **Mobile change**: update the party's mobile on create/carry-forward / edit when the number changes — do **not** mint a new SVKK id solely because mobile changed.
- **Customer ID** is also not unique (searchable legacy key only).

## Public ids

- `svkkPublicId`: unique holder key (`{grouping}{mon}{seq}` or `SVKK-{year}-{seq}` fallback) via transactional counter.
- Receipt: `RCP/{year}/{seq}` (or legacy `REC-…` depending on environment).
