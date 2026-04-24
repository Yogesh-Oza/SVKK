# API error envelope

All error responses use JSON:

```json
{
  "code": "INVALID_DOB",
  "message": "Human readable message",
  "traceId": "uuid"
}
```

`traceId` matches `x-trace-id` response header and structured logs.

## Common codes

| Code | HTTP | Meaning |
| ---- | ---- | ------- |
| `VALIDATION_ERROR` | 400 | Zod / input validation |
| `INVALID_MOBILE` | 400 | Phone normalization failed |
| `INVALID_DOB` | 400 | DOB inconsistent with policy end |
| `UNAUTHORIZED` | 401 | Missing or bad bearer token |
| `INVALID_TOKEN` | 401 | JWT invalid / expired |
| `TOKEN_REVOKED` | 401 | Refresh version mismatch |
| `FORBIDDEN` | 403 | RBAC denied |
| `NOT_FOUND` | 404 | Entity missing |
| `DUPLICATE_CSV_IMPORT` | 409 | Same checksum + mode already completed (`CSV_DUPLICATE_MODE=block`) |
| `INTERNAL_ERROR` | 500 | Unexpected failure |

Premium engine may return: `AGE_OUT_OF_BAND`, `SI_NOT_IN_CHART`, `CHART_NOT_FOUND`, `CHART_CELL_MISSING`, `MEMBERS_REQUIRED`.
