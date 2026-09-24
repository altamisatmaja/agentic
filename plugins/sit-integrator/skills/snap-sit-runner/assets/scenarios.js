'use strict';

// EXAMPLE: Close Amount VA (inquiry/payment) scenarios numbered after a UAT spreadsheet.
// Adjust ids, expect.code, and the body builders to the partner document. The numbering
// skips 11.8 on purpose to match the source document; never renumber.

const config = require('./config');
const { getAccessToken, callService, newExternalId } = require('./client');

// Cross-scenario state. 11.6 produces the inquiryRequestId used by 11.10, and a successful
// 11.10 pays the VA, which becomes the data for 11.7.
const state = {
  accessToken: null,
  inquiryRequestId: null,
  // Close Amount VA: the biller sets the amount. paidAmount in payment must equal the
  // inquiry's totalAmount exactly, so it is chained from 11.6.
  totalAmount: null,
  virtualAccountName: null,
};

const p = (n, w = 2) => String(n).padStart(w, '0');

// inquiryRequestId / paymentRequestId: unique per transaction, max 128 chars.
function newRequestId(prefix) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return `${ymd}${prefix}${Date.now().toString().slice(-10)}`;
}

// trxDateTime ISO-8601: yyyy-MM-ddTHH:mm:ssZ (no milliseconds). PDF samples may show the
// compact `20260123T063402Z`, but servers validating `Y-m-d\TH:i:sP` reject it.
function trxDateTime() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function inquiryBody(va, overrides = {}) {
  return {
    partnerServiceId: config.partnerServiceId,
    customerNo: config.customerNoOf(va),
    virtualAccountNo: va,
    // Close Amount: inquiry sends 0.00 and the real bill arrives in the response totalAmount.
    amount: { value: config.amountInquiry, currency: config.currency },
    inquiryRequestId: newRequestId('INQ'),
    sourceBankCode: '',
    channelCode: '',
    ...overrides,
  };
}

function paymentBody(va, overrides = {}) {
  // Close Amount: pay the amount from inquiry. config.amount is only a fallback when 11.6
  // hasn't run (e.g. running 11.10 alone).
  const amount = state.totalAmount || config.amount;
  return {
    partnerServiceId: config.partnerServiceId,
    customerNo: config.customerNoOf(va),
    virtualAccountNo: va,
    virtualAccountName: state.virtualAccountName || 'TEST UAT',
    paymentRequestId: state.inquiryRequestId || newRequestId('PAY'),
    paidAmount: { value: amount, currency: config.currency },
    totalAmount: { value: amount, currency: config.currency },
    trxDateTime: trxDateTime(),
    referenceNo: Date.now().toString().slice(-12),
    additionalInfo: { amountType: '2' }, // 1 = Open, 2 = Close
    sourceBankCode: '',
    channelCode: '',
    ...overrides,
  };
}

// Each scenario: { id, service, title, expect: { code, message }, run() }
// `expect.code` is matched exactly; `expect.message` loosely (case-insensitive substring).
const scenarios = [
  {
    id: '11.1',
    service: 'inquiry',
    title: 'Access Token Invalid',
    expect: { code: '4012401', message: 'token' },
    async run() {
      return callService({
        service: 'inquiry',
        accessToken: 'invalid-access-token-' + Date.now(),
        bodyObj: inquiryBody(config.vaValid),
      });
    },
  },
  {
    id: '11.2',
    service: 'inquiry',
    title: 'Unauthorized Signature',
    expect: { code: '4012400', message: 'signature' },
    async run() {
      return callService({
        service: 'inquiry',
        accessToken: state.accessToken,
        bodyObj: inquiryBody(config.vaValid),
        breakSignature: true,
      });
    },
  },
  {
    id: '11.3',
    service: 'inquiry',
    title: 'Missing Mandatory Field (virtualAccountNo)',
    expect: { code: '4002402', message: 'mandatory' },
    async run() {
      const body = inquiryBody(config.vaValid);
      delete body.virtualAccountNo;
      return callService({ service: 'inquiry', accessToken: state.accessToken, bodyObj: body });
    },
  },
  {
    id: '11.4',
    service: 'inquiry',
    title: 'Invalid Field Format (amount.value)',
    expect: { code: '4002401', message: 'format' },
    async run() {
      const body = inquiryBody(config.vaValid, { amount: { value: 'ABCDEF', currency: 'IDR' } });
      return callService({ service: 'inquiry', accessToken: state.accessToken, bodyObj: body });
    },
  },
  {
    id: '11.5',
    service: 'inquiry',
    title: 'Cannot use the same X-EXTERNAL-ID',
    expect: { code: '4092400', message: 'conflict' },
    async run() {
      // Send twice with the same X-EXTERNAL-ID. The second must be a Conflict.
      const externalId = newExternalId();
      await callService({
        service: 'inquiry',
        accessToken: state.accessToken,
        bodyObj: inquiryBody(config.vaValid),
        externalId,
      });
      return callService({
        service: 'inquiry',
        accessToken: state.accessToken,
        bodyObj: inquiryBody(config.vaValid),
        externalId,
      });
    },
  },
  {
    id: '11.6',
    service: 'inquiry',
    title: 'Inquiry valid VA — happy path',
    expect: { code: '2002400', message: 'success' },
    async run() {
      const body = inquiryBody(config.vaValid);
      const res = await callService({
        service: 'inquiry',
        accessToken: state.accessToken,
        bodyObj: body,
      });
      // Keep for 11.10: paymentRequestId, bill amount, VA name.
      if (res.json && res.json.responseCode === '2002400') {
        state.inquiryRequestId = body.inquiryRequestId;
        const d = res.json.virtualAccountData || {};
        if (d.totalAmount && d.totalAmount.value) state.totalAmount = d.totalAmount.value;
        if (d.virtualAccountName) state.virtualAccountName = d.virtualAccountName;
      }
      return res;
    },
  },
  {
    id: '11.7',
    service: 'inquiry',
    title: 'Inquiry valid VA already paid',
    expect: { code: '4042414', message: 'paid' },
    async run() {
      return callService({
        service: 'inquiry',
        accessToken: state.accessToken,
        bodyObj: inquiryBody(config.vaPaid),
      });
    },
  },
  {
    id: '11.9',
    service: 'inquiry',
    title: 'Inquiry unregistered VA',
    expect: { code: '4042412', message: 'bill' },
    async run() {
      return callService({
        service: 'inquiry',
        accessToken: state.accessToken,
        bodyObj: inquiryBody(config.vaUnregistered),
      });
    },
  },
  {
    id: '11.10',
    service: 'payment',
    title: 'Payment valid VA — happy path',
    expect: { code: '2002500', message: 'success' },
    async run() {
      return callService({
        service: 'payment',
        accessToken: state.accessToken,
        bodyObj: paymentBody(config.vaValid),
      });
    },
  },
  {
    id: '11.11',
    service: 'payment',
    title: 'Payment unregistered VA',
    expect: { code: '4042512', message: 'bill' },
    async run() {
      return callService({
        service: 'payment',
        accessToken: state.accessToken,
        bodyObj: paymentBody(config.vaUnregistered, { paymentRequestId: newRequestId('PAY') }),
      });
    },
  },
  {
    id: '11.12',
    service: 'payment',
    title: 'Payment Invalid Amount',
    expect: { code: '4042513', message: 'amount' },
    async run() {
      // Payment is only recognized when paymentRequestId matches an existing inquiry.
      // Without an inquiry first the answer is 4042512 (unknown bill) and the amount is
      // never checked. So: inquire on a separate VA, then pay a deliberately wrong amount.
      const inquiry = inquiryBody(config.vaMismatch);
      await callService({
        service: 'inquiry',
        accessToken: state.accessToken,
        bodyObj: inquiry,
      });

      // AMOUNT_PAYMENT from .env must differ from the real bill so the server returns 4042513.
      const paid = { value: config.amountPayment, currency: config.currency };

      return callService({
        service: 'payment',
        accessToken: state.accessToken,
        bodyObj: paymentBody(config.vaMismatch, {
          paidAmount: paid,
          totalAmount: paid,
          paymentRequestId: inquiry.inquiryRequestId,
        }),
      });
    },
  },
];

module.exports = { scenarios, state, getAccessToken };
