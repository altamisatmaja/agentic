---
name: snap-sit-runner
description: Build, run, and debug SIT/UAT test runners for partner APIs that follow the SNAP BI standard (Virtual Account inquiry/payment/status, QRIS MPM, Bank Statement, B2B access token), including computing X-SIGNATURE (SHA256withRSA and HMAC-SHA512), turning a UAT spreadsheet into positive/negative scenarios, matching 7-digit responseCodes, and producing evidence logs ready to paste into UAT documents. Use whenever the user mentions SNAP BI, SIT, UAT, bank/biller integration, virtual account, QRIS, "401xx00 Unauthorized Signature", "X-SIGNATURE", "stringToSign", "X-EXTERNAL-ID", "responseCode", functional test scenarios, or asks for a runner/client that calls a partner API — even if "SNAP" is not said.
---

# SNAP SIT Runner

A skill for SIT/UAT of APIs built on **SNAP BI** (Indonesia's national open API payment
standard). It captures the runner pattern used across several integrations (VA, QRIS, Bank
Statement) and the pitfalls that cost real time. If the target is the ASPI devsite or
Client Simulator, also use the `aspi-devsite` skill.

## Principles

1. **The partner document is the source of truth, but live requests decide.** API PDFs often
   contradict their own changelog, and samples go stale. When the document and the server
   disagree, record both with the **confirmation date** in the project's `CLAUDE.md`, then
   follow whatever the server proved to accept.
2. **A runner, not a server.** A SIT project is usually just a client that calls the partner
   endpoints and logs each scenario's request/response. Don't build a mock unless asked.
3. **The log is the deliverable.** Logs become UAT evidence, so they must paste cleanly and
   contain enough to reproduce every signature.
4. **Secrets never reach logs or git.** `CLIENT_SECRET`, private key contents, and portal
   cookies are never printed. `Authorization` and `X-SIGNATURE` may be printed in full in dev
   environments (they are part of the evidence).

## Workflow

1. **Gather inputs**: the partner API PDF (note version and date), the UAT scenario
   spreadsheet (scenario numbers, expected code/message), partner credentials (`CLIENT_KEY`,
   `CLIENT_SECRET`, `PARTNER_ID`, `CHANNEL_ID`, RSA key pair), and test data (valid / paid /
   unregistered VA numbers, merchants, etc.).
2. **Write the project `CLAUDE.md`**: host, endpoint table (full path + service code), both
   signature algorithms, headers per endpoint, response code table, scenario table, logging
   rules, and every "the doc says X, the server wants Y (confirmed <date>)" decision. The
   section outline is in `references/runner-blueprint.md`.
3. **Scaffold the runner** from `assets/` (Node.js, zero dependencies: built-in `crypto` + `fetch`):
   - `signature.js`: timestamp helpers and both signing algorithms
   - `client.js`: HTTP client, four-block logger, signature steps, ID generator
   - `scenarios.js`: scenario definitions `{ id, service, title, expect, run() }` + cross-scenario state
   - `run.js`: runner, assertions, PASS/FAIL summary, exit code
   - `nge`: shell wrapper (`./nge`, `./nge 11.5`, `./nge token`, `./nge log`, `./nge list`)
   - `env.example`: copy to `.env.example`; gitignore `.env` and `*.pem`
4. **Get the token working first** (`./nge token`) until `2007300`, then the service scenarios.
5. **Run scenarios sequentially, never in parallel.** They often depend on each other
   (successful inquiry → payment reuses its requestId and amount → the VA becomes paid → that
   VA is the data for the "already paid" scenario).
6. **Debug 401xx00** by comparing each logged signature step against a manual computation.
   See the checklist in `references/signature.md`.
7. **Hand over evidence**: per-run logs in `logs/`, then (via ASPI) the portal PDFs.

## Pitfalls that have actually happened

Read this list before writing code. Every item caused a real failure.

- **Serialize the body exactly once.** The string hashed for the signature must be
  byte-identical to the HTTP body sent. Calling `JSON.stringify` twice (once for the hash,
  once to send, or an HTTP library re-serializing) is the number one cause of `401xx00`.
  `signSymmetric` in the scaffold rejects non-string bodies to prevent this.
- **Two `X-TIMESTAMP` formats.** B2B token usually uses `YYYY-MM-DDTHH:mm:ss+07:00` (offset);
  services usually use ISO `yyyy-MM-ddTHH:mm:ss.SSSZ`. Check per partner; don't unify them.
- **`RELATIVE_PATH` = the full path actually called**, including any gateway prefix (e.g.
  `/api/va/<partner>/v1.0/transfer-va/inquiry`), not the `/v1.0/...` path in the partner PDF
  when a gateway/proxy sits in front.
- **`X-PARTNER-ID` ≠ `CLIENT_KEY`.** It is a separate partner code. Using the client key
  there produced 401s.
- **Field padding.** `partnerServiceId` (8 chars, left-padded with spaces per SNAP) flipped
  back and forth: the PDF said pad, the changelog said padding was removed, and the live
  server finally required space padding. Zero padding is also wrong. `CHANNEL-ID` is sent
  as-is with no padding. Confirm with a live request and record the date. In `.env`, quote
  values with leading spaces (`PARTNER_SERVICE_ID="  899xxx"`) so they are not trimmed.
- **Date formats in the body.** PDF samples may use a compact form (`20260123T063402Z`) while
  server validation is `Y-m-d\TH:i:sP` or `Y-m-d\TH:i:s\Z`. Use dashes and colons.
- **`X-EXTERNAL-ID` is unique per day.** Reusing it on the same day returns `409xx00
  Conflict`, which is itself a standard negative scenario, so the ID generator must allow
  forcing a repeated value.
- **Close Amount VAs** (`additionalInfo.amountType = "2"`): inquiry sends `amount` `0.00`,
  the real bill arrives in the response `totalAmount`, and payment must pay exactly that
  `totalAmount` (chain it through state), otherwise `404xx13 Invalid Amount`.
- **The Invalid Amount scenario needs an inquiry first.** Without an inquiry using the same
  requestId the server answers `404xx12` (unknown bill) and never checks the amount. Use a
  separate VA so it doesn't collide with the happy-path VA that was already paid.
- **Picky token requests.** Some gateways only reach body validation when `Accept`,
  `User-Agent`, or a trailing slash in the URL match a known-good request exactly. Copy from
  a request that worked; don't guess.
- **Empty bodies** are hashed as the empty string `""`.
- **Private keys aren't always PEM.** They can arrive as raw base64 (wrap into PEM, 64 chars
  per line) or as a 32-byte base64 value that isn't RSA at all (see the `aspi-devsite` skill).
- **Gateway error pages aren't JSON.** The logger must tolerate HTML: extract `<title>` and
  truncate to ~400 chars.

## Assertions

- `responseCode` = HTTP status (3) + service code (2) + case code (2). `4042412` = HTTP 404,
  service 24 (VA inquiry), case 12. Full tables in `references/response-codes.md`.
- Match `responseCode` **exactly**; match `responseMessage` **loosely** (case-insensitive
  substring). The PDF and the test plan often word the message differently for the same
  code. Code matches but wording differs: PASS with a note.
- Negative scenarios **PASS** when the server returns the expected error code. An HTTP error
  is not a test failure.
- Keep the scenario numbering from the UAT document (including gaps, e.g. no 11.8). Never
  renumber.

## Log format (required)

Every request, including get-token, is logged with these four blocks, in this order, with
pretty-printed JSON bodies:

```
URL Endpoint:
POST https://host/path

Header Request:
X-TIMESTAMP: ...

Request Body:
{ ... }

Response Body:
HTTP 200
{ ... }
```

Before those blocks, print numbered **Signature Steps**: each stringToSign input, the
minified body with its byte count, the body hash, the full stringToSign, the key used
(secrets only as length + 8-char sha256 fingerprint), and the X-SIGNATURE. Save each run to
`logs/<name>-<ISO timestamp>.log`.

## References

- `references/signature.md`: both algorithms, partner variants, 401xx00 debug checklist
- `references/response-codes.md`: service codes, case codes, standard SNAP scenarios
- `references/runner-blueprint.md`: project `CLAUDE.md` outline and each runner file's contract
- `assets/`: ready-to-copy runner scaffold
