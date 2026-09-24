# ASPI Client Simulator

The form at `https://apidevportal.aspi-indonesia.or.id/client-simulator`. ASPI calls the
endpoint you enter, and the result can be downloaded as a PDF for evidence (see "Cara download
PDF Client Simulator" in the ASPI guide).

## Form fields

| Field | Value |
|---|---|
| Service Name | scenario label, e.g. `Virtual Account Client Simulator - Inquiry - Positive` |
| URI | full URL of the target endpoint (partner/our host + full path) |
| HTTP Method | `POST` |
| Content-Type | `application/json` |
| Authorization | `Bearer <real accessToken>` |
| Authorization-Customer | empty (except for B2B2C services) |
| X-TIMESTAMP | ISO `yyyy-MM-ddTHH:mm:ss.SSSZ` (or whatever the target requires) |
| X-SIGNATURE | HMAC-SHA512 over stringToSign using the exact body you paste |
| ORIGIN | empty / per target |
| X-PARTNER-ID | the target's partner code |
| X-EXTERNAL-ID | new per scenario |
| X-IP-ADDRESS, X-DEVICE-ID, X-LATITUDE, X-LONGITUDE | empty |
| CHANNEL-ID | the target's channel, no padding |
| Body | JSON; **must be byte-identical** to what was hashed |

## Standard VA scenarios

| id | Label | Signature |
|---|---|---|
| cs.1 | Virtual Account Client Simulator - Inquiry - Positive | valid |
| cs.2 | Virtual Account Client Simulator - Inquiry - Negative | random |
| cs.3 | Virtual Account Client Simulator - Payment - Positive | valid |
| cs.4 | Virtual Account Client Simulator - Payment - Negative | random |

Inquiry and Payment in one run share the same `inquiryRequestId` / `paymentRequestId` so the
bodies are consistent.

## Field generator

The generator script (e.g. `sit/client-simulator.js`, invoked as `./nge cs [id] [--no-hit]`):

1. Reads `CLIENT_SIMULATOR_*` credentials (host, client key, partner id, secret, channel id,
   private key file), falling back to the root credentials when empty.
2. Fetches a real B2B access token from the target host (the only real request), unless
   `--no-hit` is passed or `ACCESS_TOKEN` is set in the env.
3. For each scenario: builds the body, minifies it once, signs that exact string, and prints
   all fields in form order + the pretty-printed body + the body byte count.
4. Saves to `client-simulator/logs/client-simulator-<ISO>.log`, separate from runner logs.

When pasting the body: the form may reformat JSON. If the signature is rejected, paste the
minified (single-line) version that exactly matches what was hashed.
