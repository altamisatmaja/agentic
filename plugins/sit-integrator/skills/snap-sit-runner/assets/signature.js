'use strict';

const crypto = require('crypto');

// Timestamp for /access-token/b2b — offset format: YYYY-MM-DDTHH:mm:ss+07:00
function timestampOffset(date = new Date()) {
  const jakarta = new Date(date.getTime() + 7 * 3600 * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${jakarta.getUTCFullYear()}-${p(jakarta.getUTCMonth() + 1)}-${p(jakarta.getUTCDate())}`
    + `T${p(jakarta.getUTCHours())}:${p(jakarta.getUTCMinutes())}:${p(jakarta.getUTCSeconds())}+07:00`;
}

// Timestamp for service calls — ISO-8601: yyyy-MM-ddTHH:mm:ss.SSSZ
function timestampIso(date = new Date()) {
  return date.toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z');
}

// SHA256withRSA. stringToSign = clientKey + "|" + timestamp
function signAsymmetric({ clientKey, timestamp, privateKey }) {
  const stringToSign = `${clientKey}|${timestamp}`;
  const signature = crypto.createSign('RSA-SHA256')
    .update(stringToSign, 'utf8')
    .sign(privateKey, 'base64');
  return { stringToSign, signature };
}

// HMAC-SHA512.
// stringToSign = METHOD:relativePath:accessToken:lowercase(hex(sha256(body))):timestamp
//
// `body` MUST be a string — exactly the string sent as the HTTP body. Serializing twice
// (once for the hash, once to send) risks different bytes and a 401xx00 from the server.
function signSymmetric({ method, relativePath, accessToken, body, timestamp, clientSecret }) {
  if (typeof body !== 'string') {
    throw new TypeError('signSymmetric: body must be a string, got ' + typeof body);
  }
  const bodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('hex').toLowerCase();
  const stringToSign = [method.toUpperCase(), relativePath, accessToken, bodyHash, timestamp].join(':');
  const signature = crypto.createHmac('sha512', clientSecret)
    .update(stringToSign, 'utf8')
    .digest('base64');
  return { stringToSign, signature, bodyHash };
}

// JSON.stringify already emits no whitespace. This function makes explicit that its output
// is used both for the hash AND as the request body.
function minify(obj) {
  return JSON.stringify(obj);
}

module.exports = { timestampOffset, timestampIso, signAsymmetric, signSymmetric, minify };
