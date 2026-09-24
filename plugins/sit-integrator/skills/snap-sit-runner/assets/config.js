'use strict';

const fs = require('fs');
const path = require('path');

// Minimal .env loader, no external dependency. Quoted values are kept verbatim
// (including leading spaces, e.g. a padded partnerServiceId).
(function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = raw.slice(raw.indexOf('=') + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
})();

const HOST = (process.env.HOST || '').replace(/\/+$/, '');

// Full paths: used for the URL and as RELATIVE_PATH in stringToSign.
// Include any gateway prefix. Adjust to the partner's endpoints.
const PATHS = {
  token: process.env.PATH_TOKEN || '/v1.0/access-token/b2b',
  inquiry: process.env.PATH_INQUIRY || '/v1.0/transfer-va/inquiry',
  payment: process.env.PATH_PAYMENT || '/v1.0/transfer-va/payment',
  status: process.env.PATH_STATUS || '/v1.0/transfer-va/status',
};

const config = {
  host: HOST,
  paths: PATHS,
  url: (name) => HOST + PATHS[name],

  clientKey: process.env.CLIENT_KEY || '',
  clientSecret: process.env.CLIENT_SECRET || '',
  partnerId: process.env.PARTNER_ID || '',
  channelId: process.env.CHANNEL_ID || '',
  privateKeyFile: process.env.PRIVATE_KEY_FILE || 'rsa_private_key.pem',

  // Don't trim: space padding (if the partner requires it) must reach the body.
  partnerServiceId: process.env.PARTNER_SERVICE_ID || '',
  vaValid: process.env.VA_VALID || '',
  vaPaid: process.env.VA_PAID || '',
  vaUnregistered: process.env.VA_UNREGISTERED || '',
  vaMismatch: process.env.VA_MISMATCH || '',

  amountInquiry: process.env.AMOUNT_INQUIRY || '0.00',
  amountPayment: process.env.AMOUNT_PAYMENT || '99999999.00',
  amount: process.env.AMOUNT || '10000.00',
  currency: process.env.CURRENCY || 'IDR',

  logDir: process.env.LOG_DIR || 'logs',
};

config.privateKey = () => {
  const full = path.isAbsolute(config.privateKeyFile)
    ? config.privateKeyFile
    : path.join(__dirname, config.privateKeyFile);
  return fs.readFileSync(full, 'utf8');
};

// virtualAccountNo = partnerServiceId + customerNo.
config.customerNoOf = (va) => va.slice(config.partnerServiceId.trim().length);

// Derive optional values so the runner works with minimal data.
config.resolveDerived = () => {
  if (!config.vaPaid) config.vaPaid = config.vaValid; // paid after the successful payment scenario
  if (!config.vaUnregistered) {
    config.vaUnregistered = config.partnerServiceId.trim() + '9'.repeat(Math.max(1, config.vaValid.length - config.partnerServiceId.trim().length));
  }
  if (!config.vaMismatch) config.vaMismatch = config.vaValid;
};

config.missing = () => {
  const required = ['host', 'clientKey', 'clientSecret', 'partnerId', 'channelId', 'partnerServiceId', 'vaValid'];
  return required.filter((k) => !config[k]);
};

module.exports = config;
