# SNAP BI response codes

Format: `responseCode` = HTTP status (3 digits) + service code (2) + case code (2).

`4042412` → HTTP 404, service 24 (VA inquiry), case 12 (Invalid Bill/Virtual Account).

## Common service codes

| Code | Service |
|---|---|
| 73 | B2B Access Token |
| 24 | Transfer VA: Inquiry |
| 25 | Transfer VA: Payment |
| 26 | Transfer VA: Inquiry Status |
| 14 | Bank Statement |
| 47 | QRIS MPM Generate |
| 51 | QRIS MPM Query |
| 52 | QRIS MPM Notify |
| 77 | QRIS MPM Cancel |
| 78 | QRIS MPM Refund |
| 12 | Transaction History List |

The partner PDF wins on service codes; this table is only a reminder.

## Common case codes (`xx` = service code)

| Code | Meaning | Typical scenario |
|---|---|---|
| `200xx00` | Successful | happy path |
| `400xx00` | Bad Request | malformed JSON |
| `400xx01` | Invalid Field Format {field} | badly formatted value (e.g. amount `"ABCDEF"`) |
| `400xx02` | Invalid Mandatory Field {field} | required field removed/empty |
| `401xx00` | Unauthorized. Signature | randomized X-SIGNATURE |
| `401xx01` | Invalid Token (B2B) | fake/expired token |
| `403xx02` | Exceeds Transaction Amount Limit | amount above limit |
| `403xx18` | Inactive Account | closed account (Bank Statement) |
| `404xx12` | Invalid Bill/Virtual Account | VA/bill not found |
| `404xx13` | Invalid Amount | amount mismatch |
| `404xx14` | Paid Bill | bill already paid |
| `404xx19` | Invalid Bill (expired) | bill expired |
| `409xx00` | Conflict | X-EXTERNAL-ID reused on the same day |
| `500xx00` | General Error | |

Some test plans write generic expectations like `401xx01`. When building assertions, replace
`xx` with the service code of the endpoint actually called.

## Standard "Any Service" scenarios

Nearly every SNAP UAT spreadsheet contains these five negative scenarios per service:

1. Access Token Invalid → `401xx01`
2. Unauthorized Signature → `401xx00`
3. Missing Mandatory Field → `400xx02`
4. Invalid Field Format → `400xx01`
5. Cannot use the same X-EXTERNAL-ID → `409xx00` (send twice with the same ID; the second response is judged)

Then per-service scenarios (happy path, paid VA, unregistered VA, invalid amount, etc.).

## Assertion rules

- `responseCode`: exact match.
- `responseMessage`: loose, case-insensitive substring on a keyword
  (`token`, `signature`, `mandatory`, `format`, `conflict`, `paid`, `bill`, `amount`).
- Code matches but wording differs: PASS + note "code matches, message wording differs".
- Response without `responseCode` (gateway HTML, timeout): FAIL with its HTTP status.
