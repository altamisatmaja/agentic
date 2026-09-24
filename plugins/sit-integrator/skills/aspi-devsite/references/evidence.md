# UAT evidence for ASPI

## Folder layout

```
evidence_aspi_<partner>_<product>/
├── devsite/
│   ├── API Get Token B2B - Positive - Success.pdf
│   ├── API Get Token B2B - Negative - Invalid JSON body.pdf
│   ├── API Virtual Account - Inquiry - Positive.pdf
│   ├── API Virtual Account - Inquiry - Negative.pdf
│   ├── API Virtual Account - Payment - Positive.pdf
│   ├── API Virtual Account - Payment - Negative.pdf
│   ├── API Virtual Account - Inquiry Status - Positive.pdf
│   └── API Virtual Account - Inquiry Status - Negative.pdf
└── client_simulator/
    ├── Client Simulator - Virtual Account - Inquiry - Positive.pdf
    ├── Client Simulator - Virtual Account - Inquiry - Negative.pdf
    ├── Client Simulator - Virtual Account - Payment - Positive.pdf
    └── Client Simulator - Virtual Account - Payment - Negative.pdf
```

Naming pattern: `<Path> - <Product> - <Service> - <Positive|Negative>[ - <detail>].pdf`. For
numbered spreadsheets (QRIS etc.), use `<number> <scenario title>.pdf`, e.g.
`18.1 Access Token Invalid.pdf`, or `pdf/<dynamic|static>/<row>.<scenario>.pdf`. Zip the
folder for hand-over.

## Downloading devsite activity reports

The portal records every request the gateway receives. An automated flow that worked:

1. The runner saves a per-scenario log (JSON or text) with the `X-TIMESTAMP` it sent.
2. Fetch the activity list from the portal (sorted by Timestamp ASC) using session cookies
   from a logged-in browser. Read cookies from the `ASPI_COOKIES` env var (JSON); never put
   them in source.
3. Pair logs with activities by **closest timestamp**. The portal's recorded time usually
   matches `X-TIMESTAMP` to the second, sometimes off by 1–2 seconds.
4. Reports are HTML: convert to PDF with headless Chrome
   (`"Google Chrome" --headless --print-to-pdf=out.pdf file.html`), then rename per scenario.
5. Provide `--dry-run` that only prints the log ↔ activity pairs.

## Verifying PDFs against logs

Before hand-over, match each PDF with its runner log. They must agree on:

- HTTP method + endpoint URL
- `X-TIMESTAMP`, `X-SIGNATURE`, `X-PARTNER-ID`, `X-EXTERNAL-ID`
- Request body (compare minified forms)
- `responseCode`

Extract PDF text (`pdftotext`, or decompress zlib streams if needed), normalize whitespace,
then report per scenario: OK / which fields differ. Also report PDFs without a matching log
(and vice versa).

## Pre-submission checklist

- [ ] Every spreadsheet scenario has a PDF named per the pattern
- [ ] Every PDF passes verification against its log
- [ ] Negative scenarios show the expected error code (not a 5xx / gateway HTML)
- [ ] No secrets, private keys, or cookies in any PDF or log included in the zip
- [ ] The scenario spreadsheet's result/actual columns are filled in from the PDFs
