---
name: aspi-devsite
description: Testing SNAP BI integrations through the ASPI SNAP Developer Site (devsite, apidevportal.aspi-indonesia.or.id) and the ASPI Client Simulator, including obtaining "Request Aplikasi Pengujian" credentials, token signatures via /utilities/signature-auth, the port 44310 gateway, Virtual Account / QRIS / Bank Statement scenarios on the devsite, and collecting UAT evidence (PDF activity reports, per-scenario evidence, log vs PDF verification). Use whenever the user mentions ASPI, devsite, apidevportal, Client Simulator, "Aplikasi Pengujian", SNAP certification/SIT with ASPI, or UAT evidence for ASPI.
---

# ASPI Devsite & Client Simulator

ASPI (the Indonesian Payment System Association) offers two SNAP BI testing paths:

1. **Devsite (SNAP Developer Site)**: ASPI's mock/sandbox API. We call the devsite; it records
   every request as an *activity* that can be downloaded as a PDF for evidence.
2. **Client Simulator**: an ASPI web form that calls **our/the partner's real endpoint**. We
   only prepare the field values; ASPI executes the request and records the result.

The signature algorithms are standard SNAP BI, so use the `snap-sit-runner` skill for the
runner, logger, and assertions. This skill covers only what is ASPI-specific.

## Hosts and paths

| Purpose | Address |
|---|---|
| Web portal (login, Swagger, activity, Client Simulator) | `https://apidevportal.aspi-indonesia.or.id` |
| Devsite API gateway | `https://apidevportal.aspi-indonesia.or.id:44310` |
| Client Simulator | `https://apidevportal.aspi-indonesia.or.id/client-simulator` |

The host **without port 44310 returns 404** for every `/api/v1.0/*`. Devsite paths have no
partner gateway prefix:

| Service | Path | Success |
|---|---|---|
| B2B Access Token | `/api/v1.0/access-token/b2b` | `2007300` |
| VA Inquiry | `/api/v1.0/transfer-va/inquiry` | `2002400` |
| VA Payment | `/api/v1.0/transfer-va/payment` | `2002500` |
| VA Inquiry Status | `/api/v1.0/transfer-va/status` | `2002600` |
| Bank Statement | `/api/v1.0/bank-statement` | `2001400` |
| QRIS MPM Generate / Query / Refund / Cancel | `/api/v1.0/qr/qr-mpm-generate`, `/qr-mpm-query`, `/qr-mpm-refund`, `/qr-mpm-cancel` | `2004700` / `2005100` / `2007800` / `2007700` |
| Transaction History | `/api/v1.0/transaction-history-list`, `-detail` | `2001200` |
| Utility: sign token | `/api/v1.0/utilities/signature-auth` | |
| Utility: sign service | `/api/v1.0/utilities/signature-service` | |

Make every path overridable via `.env` (`PATH_TOKEN`, etc.) because the devsite can change.

## Credentials

Portal → Sign In → click your email → **Request Aplikasi Pengujian**. Copy the Client Id,
Client Secret, Public Key, and Private Key into `.env` (**not** into code, not into git).

The portal's "Private Key" is **not an RSA PEM**; it is ~32 bytes of base64. Local
SHA256withRSA cannot work with it. Two approaches are proven:

- **Utility endpoint (default)**: `POST /api/v1.0/utilities/signature-auth` with headers
  `X-TIMESTAMP`, `X-CLIENT-KEY`, `Private_Key: <portal string as-is>`, body `{}`. Use the
  response `signature` as the access-token `X-SIGNATURE`.
- **Local HMAC (QRIS mock)**: `base64(HMAC_SHA512(CLIENT_KEY + "|" + X-TIMESTAMP,
  base64decode(PrivateKey)))`.

Make both selectable via `AUTH_SIGN_MODE=utility|local`.

For services (inquiry/payment/status), **compute HMAC-SHA512 yourself** with
`CLIENT_SECRET` (`SERVICE_SIGN_MODE=local`). The `utilities/signature-service` endpoint
consistently answered `4000000 "The endpointUrl field is required."` even with `EndpointUrl`
sent via header, body, or query in every casing tried. Keep a `utility` mode only as a
retry option.

## Devsite scenarios

The devsite is a mock: VA data doesn't need real customer numbers (the partner PDF sample is
enough, e.g. `partnerServiceId` + a 20-digit customerNo, max 28 chars). Negative scenarios are
mostly distinguished by signature. A set that passed:

| id | Scenario | Expected |
|---|---|---|
| b2b.1 | Get Token B2B, Positive | `2007300` |
| b2b.2 | Get Token B2B, Negative (Invalid JSON body, `grantType` missing) | `4007302` |
| va.1 / va.2 | VA Inquiry, Positive / Negative (random signature) | `2002400` / `4012400` |
| va.3 / va.4 | VA Payment, Positive / Negative | `2002500` / `4012500` |
| va.5 / va.6 | VA Inquiry Status, Positive / Negative | `2002600` / `4012600` |
| 6.1–6.5 | Bank Statement: Any Service (token, signature, mandatory, format, external-id) | `401xx01`, `401xx00`, `400xx02`, `400xx01`, `409xx00` |
| 6.6 | Bank Statement, account mutations | `2001400` |
| 6.7 | Bank Statement, closed account | `4031418` |

Bank Statement fixtures from the ASPI Swagger contract: account `2000200202`, closed-account
candidate `2000200201`, card token `6d7963617264746f6b656e`. Make them overridable via `.env`.

## Client Simulator

Field details and flow are in `references/client-simulator.md`. Core rules:

- The target URI is **the real partner/our endpoint**, not the devsite. Keep its credentials
  separate with a prefix (`CLIENT_SIMULATOR_*`) from the devsite credentials in the same `.env`.
- The generator script **never calls** inquiry/payment. ASPI must execute them so they are
  recorded as evidence. The only real request allowed is get-token, so `Authorization` holds
  a valid token. Provide `--no-hit` for print-only.
- Tokens usually last 900 seconds: generate fields right before filling the form.

## Evidence

See `references/evidence.md`: folder layout, PDF naming, downloading activity reports and
matching them to runner logs, and verifying PDFs against logs.

## Things to watch

- One project often tests two targets at once (the partner directly + the ASPI devsite). Use
  a subfolder with its own `.env` and `config.js`, and reuse `signature.js` from the root.
- Portal session cookies (`dev.site.session`, `dev.site.application`, `dev.site.antiforgery`)
  are as sensitive as a password: read them from env (`ASPI_COOKIES` JSON), **never** write
  them into source.
- Record every live finding (paths, sign modes, success codes) with its date in the project
  `CLAUDE.md` and in `.env.example` comments.
