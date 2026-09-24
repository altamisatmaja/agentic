# SIT runner project blueprint

## Layout

```
<project>/
├── CLAUDE.md             # integration contract (outline below)
├── .env.example          # committed; .env is not
├── .gitignore            # .env, *.pem, logs/
├── signature.js          # timestamps + signing (no I/O)
├── config.js             # reads .env, endpoint paths, derived values
├── client.js             # fetch + logger + signature steps + ID generator
├── scenarios.js          # scenario list + cross-scenario state
├── run.js                # runner, assertions, summary, exit code
├── nge                   # shell wrapper
├── logs/                 # per-run output
└── docs/                 # partner API PDF, scenario spreadsheet (optional; don't commit if confidential)
```

If one project tests two targets (e.g. the partner directly and the ASPI devsite), add a
subfolder (`sit/`) with its own `config.js`, `.env`, and `scenarios.js`, but **reuse
`../signature.js`**: the algorithms are a single source of truth; only credentials and hosts
differ.

## File contracts

**signature.js**: pure functions. `timestampOffset()`, `timestampIso()`,
`signAsymmetric({clientKey, timestamp, privateKey})`,
`signSymmetric({method, relativePath, accessToken, body, timestamp, clientSecret})` which
rejects non-string bodies, and `minify(obj)`. Also return `stringToSign` and `bodyHash` so
they can be logged.

**client.js**:
- `send({url, method, headers, body})`: never throws on network errors; turns them into
  `{status: 0, text: '{"error":"network",...}'}` so the runner still records the scenario.
- `logExchange`: four blocks (URL Endpoint, Header Request, Request Body, Response Body).
- `logSignatureSteps`: numbered steps; secrets shown only as length + fingerprint.
- `getAccessToken({breakSignature})` and `callService({service, accessToken, bodyObj,
  externalId, breakSignature, omitHeaders, overrideHeaders})`: these parameters cover every
  standard negative scenario.
- `newExternalId()`: unique per day; callers may pass a fixed value.
- `saveLog(name)`: writes all lines of the run to `logs/<name>-<ISO>.log`.

**scenarios.js**: an array of `{ id, service, title, expect: { code, message }, async run() }`
and a `state` object (accessToken, inquiryRequestId, totalAmount, virtualAccountName, ...).
Body builders (`inquiryBody(va, overrides)`) accept overrides so a negative scenario only
needs to delete/replace one field.

**run.js**: check required config (exit 2 with a message explaining how to fill it), fetch the
token once, run the selected scenarios (`node run.js 11.5 11.6`) in order, print `RESULT:
PASS/FAIL — expect X, actual Y`, a final summary, save the log, and exit 0 only if all pass.

**nge**: `./nge` / `./nge run [id...]` / `./nge <id...>` / `./nge token` / `./nge log` /
`./nge list` / `./nge help`.

## Project CLAUDE.md outline

```markdown
# CLAUDE.md

<One paragraph: this is a runner for which API, which environment, not a server implementation.>

Source of truth: `<PDF name>` (version X, date). On conflict with this file the PDF wins,
unless the entry says "confirmed live <date>".

## Endpoints
| Service | Method | Full path (= RELATIVE_PATH) | Service Code |

## Authentication
### B2B access token: <algorithm>, X-TIMESTAMP format, body, success response
### Services: <algorithm>, X-TIMESTAMP format, RELATIVE_PATH rule

## Headers
<per endpoint type>

## Response codes
<relevant code table + assertion rules>

## Scenarios
| # | Service | Scenario | Expected |
<notes on ordering/chaining and numbering gaps>

## Logging
<four-block format, what may and may not be printed>

## Configuration
<.env contents, padding/format of each field with its confirmation date>
```

## Decision notes

Whenever a live request contradicts the document, add a line to CLAUDE.md and a comment in
`.env.example` in this form:

```
# <FIELD>: <rule>. Confirmed <YYYY-MM-DD> (<short evidence, e.g. "zero pad → 401">).
```

This keeps the next session from repeating the same experiments.
