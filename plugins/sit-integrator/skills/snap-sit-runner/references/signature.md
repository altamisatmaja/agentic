# SNAP BI signatures

There are two algorithms. Don't mix them up: the token uses asymmetric signing, services use
symmetric signing (except for the partner variants below).

## 1. B2B access token: SHA256withRSA (asymmetric)

```
stringToSign = <X-CLIENT-KEY> + "|" + <X-TIMESTAMP>
X-SIGNATURE  = base64( RSA-SHA256-sign( stringToSign, private_key ) )
```

- Typical endpoint: `POST .../v1.0/access-token/b2b`
- Headers: `Content-Type`, `X-TIMESTAMP`, `X-CLIENT-KEY`, `X-SIGNATURE`
- Body: `{"grantType":"client_credentials","additionalInfo":{}}` (`additionalInfo` is an
  empty object, not `null`)
- `X-TIMESTAMP` is usually the offset form `YYYY-MM-DDTHH:mm:ss+07:00`
- Success: `2007300`, fields `accessToken`, `expiresIn` (seconds, usually 900)
- The RSA 2048-bit private key is ours; its public key is registered with the partner

## 2. Services (inquiry, payment, status, ...): HMAC-SHA512 (symmetric)

```
stringToSign = <HTTP_METHOD> + ":" + <RELATIVE_PATH> + ":" + <accessToken> + ":"
             + lowercase( hex( SHA256( minify(body) ) ) ) + ":" + <X-TIMESTAMP>
X-SIGNATURE  = base64( HMAC_SHA512( stringToSign, CLIENT_SECRET ) )
```

- Headers: `Content-Type: application/json`, `Authorization: Bearer <token>`, `CHANNEL-ID`,
  `X-TIMESTAMP`, `X-EXTERNAL-ID`, `X-PARTNER-ID`, `X-SIGNATURE` (sometimes also `ORIGIN`)
- `minify(body)` = JSON without whitespace, and these exact bytes are what gets sent
- Empty body → hash of `""`
- `X-TIMESTAMP` is usually ISO `yyyy-MM-ddTHH:mm:ss.SSSZ`; servers often allow ±30 minutes
- `RELATIVE_PATH` = the full path called (including any gateway prefix), without the host

## Variants seen in the wild

| Variant | stringToSign | Key |
|---|---|---|
| RSA service signature (no token), e.g. QRIS acquirers | `METHOD:URL_PATH:lowerhex(sha256(body)):TIMESTAMP` | RSA private key, SHA256withRSA |
| Notify/callback from partner to us | same as the row above | verify with the partner's public key |
| Token on the ASPI mock/devsite | `CLIENT_KEY|TIMESTAMP` | HMAC-SHA512 with key = base64-decode(portal "Private Key"), or via the utility endpoint (see the `aspi-devsite` skill) |

Always check the "Signature" chapter of the partner PDF; this table doesn't replace it.

## Key shapes

- Full PEM (`-----BEGIN RSA PRIVATE KEY-----` PKCS#1 or `PRIVATE KEY` PKCS#8): use as-is.
- Raw base64 without headers: strip whitespace, split into 64-char lines, add header/footer.
- Base64 only ~44 chars long (32 bytes): **not RSA**. It can't be used for SHA256withRSA; it's
  usually an HMAC key or an input for the portal's utility signature endpoint.

## `401xx00 Unauthorized Signature` debug checklist

Check in order, comparing against the Signature Steps in the log:

1. Is the hashed body byte-identical to the sent body? (byte count in the log = `Content-Length`)
2. Does `RELATIVE_PATH` use the full called path, including the gateway prefix? No query string? Same trailing slash?
3. Is the header `X-TIMESTAMP` exactly the one in stringToSign? Right format for the endpoint type?
4. Is the body hash lowercase hex (not base64, not uppercase)?
5. Is the token in stringToSign the same as in `Authorization` (without `Bearer `)?
6. Right secret/key? Compare its sha256 fingerprint with the value the partner gave.
7. Right `X-PARTNER-ID` (not the `CLIENT_KEY`)?
8. Padded fields (`partnerServiceId`) and value types (`"10000.00"` string, not a number) correct?
9. Is the machine clock right (NTP)? Large skew also yields 401.
10. Still stuck: recompute by hand with `openssl`:

```bash
printf '%s' "$BODY" | openssl dgst -sha256 | awk '{print tolower($NF)}'
printf '%s' "$STRING_TO_SIGN" | openssl dgst -sha512 -hmac "$CLIENT_SECRET" -binary | base64
printf '%s' "$CLIENT_KEY|$TS" | openssl dgst -sha256 -sign private.pem | base64
```
