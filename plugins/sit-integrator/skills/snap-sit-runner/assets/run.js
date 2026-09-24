'use strict';

const config = require('./config');
const { out, saveLog } = require('./client');
const { scenarios, state, getAccessToken } = require('./scenarios');

function assert(res, expect) {
  const code = res.json && res.json.responseCode;
  const message = (res.json && res.json.responseMessage) || '';
  if (!code) {
    return { pass: false, actual: `HTTP ${res.status} (no responseCode)`, note: 'response is not SNAP JSON' };
  }
  const codeOk = code === expect.code;
  // Loose message match: the PDF and the test plan word the same code differently.
  const msgOk = !expect.message || message.toLowerCase().includes(expect.message.toLowerCase());
  return {
    pass: codeOk,
    actual: `${code} ${message}`,
    note: codeOk && !msgOk ? 'code matches, message wording differs' : '',
  };
}

function bar(char = '=') {
  return char.repeat(78);
}

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

  const missing = config.missing();
  if (missing.length) {
    console.error('Required config missing in .env: ' + missing.join(', '));
    console.error('');
    console.error('  HOST, CLIENT_KEY, CLIENT_SECRET, PARTNER_ID, CHANNEL_ID  credentials from the partner');
    console.error('  PARTNER_SERVICE_ID  biller prefix/code from the partner (check its padding rule)');
    console.error('  VA_VALID            a registered, unpaid test VA (prefix + customerNo)');
    console.error('');
    console.error('VA_PAID, VA_UNREGISTERED, and VA_MISMATCH are optional — derived when empty.');
    process.exit(2);
  }
  config.resolveDerived();

  out(bar());
  out(`SNAP SIT — AUTOMATED TEST RUN`);
  out(`Host        : ${config.host}`);
  out(`Time        : ${new Date().toISOString()}`);
  out(`Partner     : ${config.partnerId}`);
  out(`VA valid    : ${config.vaValid}`);
  out(`VA paid     : ${config.vaPaid}${config.vaPaid === config.vaValid ? '  (derived from VA_VALID)' : ''}`);
  out(`VA unknown  : ${config.vaUnregistered}`);
  out(bar());
  out('');

  // --- Get access token (used by every scenario except the invalid-token one) ---
  out(bar('-'));
  out('SETUP — Get Access Token B2B');
  out(bar('-'));
  out('');
  const tokenRes = await getAccessToken();
  state.accessToken = tokenRes.accessToken;

  if (!state.accessToken) {
    out('FAILED: no access token. Scenarios that need a token cannot run.');
    saveLog('run');
    process.exit(1);
  }

  const results = [];
  const list = only.length ? scenarios.filter((s) => only.includes(s.id)) : scenarios;

  if (!list.length) {
    console.error(`Scenario not found: ${only.join(', ')}`);
    process.exit(2);
  }

  for (const sc of list) {
    out(bar('-'));
    out(`SCENARIO ${sc.id} — ${sc.title}`);
    out(`Expected: ${sc.expect.code} ${sc.expect.message || ''}`);
    out(bar('-'));
    out('');

    let res;
    try {
      res = await sc.run();
    } catch (err) {
      out(`ERROR running scenario: ${err.message}`);
      out('');
      results.push({ id: sc.id, title: sc.title, pass: false, actual: `error: ${err.message}`, note: '' });
      continue;
    }

    const verdict = assert(res, sc.expect);
    out(`RESULT: ${verdict.pass ? 'PASS' : 'FAIL'} — expect ${sc.expect.code}, actual ${verdict.actual}`);
    if (verdict.note) out(`Note: ${verdict.note}`);
    out('');
    results.push({ id: sc.id, title: sc.title, ...verdict });
  }

  // --- Summary ---
  out(bar());
  out('SUMMARY');
  out(bar());
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    out(`${status.padEnd(5)} ${r.id.padEnd(6)} ${r.title}`);
    if (!r.pass) out(`             actual: ${r.actual}`);
    else if (r.note) out(`             ${r.note}`);
  }
  const passed = results.filter((r) => r.pass).length;
  out('');
  out(`${passed}/${results.length} scenarios PASS`);
  out(bar());

  const file = saveLog('run');
  console.log(`\nLog saved: ${file}`);

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
