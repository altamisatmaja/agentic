'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = require('./config');
const sig = require('./signature');

// ---------- logging ----------

const lines = [];

function out(s = '') {
  console.log(s);
  lines.push(s);
}

function pretty(body) {
  if (body === '' || body === undefined || body === null) return '(empty)';
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    // Not JSON — usually a gateway error page. Truncate so the log stays readable.
    const s = String(body).trim();
    if (s.length <= 400) return s;
    const title = (s.match(/<title>([^<]*)<\/title>/i) || [])[1];
    return (title ? `[non-JSON: ${title.trim()}]\n` : '[non-JSON]\n')
      + s.slice(0, 400) + `\n... (${s.length} bytes, truncated)`;
  }
}

// Summary of a secret that must never be logged verbatim (CLIENT_SECRET, private key).
// Length + fingerprint is enough to confirm the right credential without leaking it.
function secretRef(label, value) {
  const fp = crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 8);
  return `${label} (hidden; ${value.length} chars, sha256:${fp}...)`;
}

// Log every step of building X-SIGNATURE so it can be reproduced by hand when
// debugging 401xx00.
function logSignatureSteps(steps) {
  out(`Signature Steps (${steps.algorithm}):`);
  steps.items.forEach(([label, value], i) => {
    const n = String(i + 1).padStart(2, ' ');
    if (String(value).includes('\n')) {
      out(`${n}. ${label}:`);
      for (const l of String(value).split('\n')) out(`    ${l}`);
    } else {
      out(`${n}. ${label}: ${value}`);
    }
  });
  out('');
}

function logExchange({ url, method, headers, requestBody, responseBody, status }) {
  out(`URL Endpoint:`);
  out(`${method} ${url}`);
  out('');
  out(`Header Request:`);
  for (const [k, v] of Object.entries(headers)) out(`${k}: ${v}`);
  out('');
  out(`Request Body:`);
  out(pretty(requestBody));
  out('');
  out(`Response Body:`);
  out(`HTTP ${status}`);
  out(pretty(responseBody));
  out('');
}

function saveLog(name) {
  const dir = path.join(__dirname, config.logDir);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${name}-${stamp}.log`);
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return file;
}

// ---------- external id ----------

// X-EXTERNAL-ID must be unique per day. The duplicate-ID scenario reuses a value on
// purpose, so callers may force a specific one.
function newExternalId() {
  return Date.now().toString() + Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
}

// ---------- HTTP ----------

async function send({ url, method = 'POST', headers, body }) {
  let status = 0;
  let text = '';
  try {
    const res = await fetch(url, { method, headers, body });
    status = res.status;
    text = await res.text();
  } catch (err) {
    status = 0;
    text = JSON.stringify({ error: 'network', message: err.message });
  }
  logExchange({ url, method, headers, requestBody: body, responseBody: text, status });
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave null */ }
  return { status, text, json };
}

// ---------- get access token ----------

async function getAccessToken({ clientKey = config.clientKey, breakSignature = false } = {}) {
  const timestamp = sig.timestampOffset();
  // additionalInfo must be an empty object, not null.
  const body = sig.minify({ grantType: 'client_credentials', additionalInfo: {} });

  let signature;
  let stringToSign = '';
  if (breakSignature) {
    signature = crypto.randomBytes(64).toString('base64');
  } else {
    ({ signature, stringToSign } = sig.signAsymmetric({
      clientKey,
      timestamp,
      privateKey: config.privateKey(),
    }));
  }

  logSignatureSteps({
    algorithm: 'SHA256withRSA — asymmetric',
    items: breakSignature
      ? [
        ['X-CLIENT-KEY', clientKey],
        ['X-TIMESTAMP (offset +07:00)', timestamp],
        ['stringToSign', '(skipped — invalid signature scenario)'],
        ['X-SIGNATURE', `${signature}   <-- 64 random bytes, invalid on purpose`],
      ]
      : [
        ['X-CLIENT-KEY', clientKey],
        ['X-TIMESTAMP (offset +07:00)', timestamp],
        ['stringToSign = <X-CLIENT-KEY> + "|" + <X-TIMESTAMP>', stringToSign],
        ['Private key', `${config.privateKeyFile} (contents hidden)`],
        ['X-SIGNATURE = base64(RSA-SHA256-sign(stringToSign, privateKey))', signature],
      ],
  });

  // Some gateways only reach body validation when Accept, User-Agent, or a trailing slash
  // match a known-good request exactly. Copy from that request; don't guess.
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-TIMESTAMP': timestamp,
    'X-CLIENT-KEY': clientKey,
    'X-SIGNATURE': signature,
  };

  const res = await send({ url: config.url('token'), headers, body });
  return { ...res, accessToken: res.json && res.json.accessToken };
}

// ---------- services ----------

// bodyObj is serialized once; the resulting string is both hashed and sent.
async function callService({
  service,              // key of config.paths, e.g. 'inquiry' | 'payment'
  accessToken,
  bodyObj,
  externalId = newExternalId(),
  breakSignature = false,
  omitHeaders = [],
  overrideHeaders = {},
}) {
  const relativePath = config.paths[service];
  const timestamp = sig.timestampIso();
  const body = sig.minify(bodyObj);

  let signature;
  let stringToSign = '';
  let bodyHash = '';
  if (breakSignature) {
    signature = crypto.randomBytes(64).toString('base64');
  } else {
    ({ signature, stringToSign, bodyHash } = sig.signSymmetric({
      method: 'POST',
      relativePath,
      accessToken,
      body,
      timestamp,
      clientSecret: config.clientSecret,
    }));
  }

  logSignatureSteps({
    algorithm: 'HMAC-SHA512 — symmetric',
    items: breakSignature
      ? [
        ['HTTP_METHOD', 'POST'],
        ['RELATIVE_PATH', relativePath],
        ['X-TIMESTAMP (ISO-8601 .SSSZ)', timestamp],
        ['stringToSign', '(skipped — invalid signature scenario)'],
        ['X-SIGNATURE', `${signature}   <-- 64 random bytes, invalid on purpose`],
      ]
      : [
        ['HTTP_METHOD', 'POST'],
        ['RELATIVE_PATH', relativePath],
        ['accessToken', accessToken],
        [`minify(body) — ${Buffer.byteLength(body, 'utf8')} bytes, these exact bytes are sent`, body],
        ['lowercase(hex(SHA256(minify(body))))', bodyHash],
        ['X-TIMESTAMP (ISO-8601 .SSSZ)', timestamp],
        ['stringToSign = METHOD:PATH:TOKEN:BODYHASH:TIMESTAMP', stringToSign],
        ['HMAC key', secretRef('CLIENT_SECRET', config.clientSecret)],
        ['X-SIGNATURE = base64(HMAC_SHA512(stringToSign, CLIENT_SECRET))', signature],
      ],
  });

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'CHANNEL-ID': config.channelId,
    'X-TIMESTAMP': timestamp,
    'X-EXTERNAL-ID': externalId,
    'X-PARTNER-ID': config.partnerId,
    'X-SIGNATURE': signature,
    ...overrideHeaders,
  };
  for (const h of omitHeaders) delete headers[h];

  const res = await send({ url: config.url(service), headers, body });
  return { ...res, externalId };
}

module.exports = { getAccessToken, callService, newExternalId, out, saveLog, lines };
