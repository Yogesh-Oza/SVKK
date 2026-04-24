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

- **One party per mobile** in Phase 1 (`InsuredParty.mobile` UNIQUE).
- **Mobile change**: update party in admin flow — do **not** mint a new SVKK id.
- **Shared family phone**: documented limitation; use admin merge in a later phase if needed.

## Public ids

- `svkkPublicId`: `SVKK-{year}-{6-digit-seq}` via transactional counter.
- Receipt: `REC-{year}-{6-digit-seq}`.
