import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commandSchemas, COMMERCE_ERROR_CODES, lineTotals, parse } from '../pos-contracts.js';

test('money validation rejects non-finite, exponent, negative, excess precision and price overrides', () => {
  const payment = { expectedVersion: 1, paymentMethodId: '01900000-0000-7000-8000-000000000001', amount: '100.00' };
  for (const amount of ['NaN','Infinity','1e2','-1','0','0.001',NaN,Infinity]) assert.throws(() => parse(commandSchemas.payment,{...payment,amount}),{ code: 'VALIDATION_ERROR' });
  assert.throws(() => parse(commandSchemas.payment,{...payment,companyId:'forged'}),{code:'VALIDATION_ERROR'});
  assert.throws(() => parse(commandSchemas.addLine,{expectedVersion:1,productId:payment.paymentMethodId,quantity:'1',unitPrice:'0.01'}),{code:'VALIDATION_ERROR'});
});

test('server decimal calculation includes/excludes tax and rounds once per line', () => {
  assert.deepEqual(lineTotals({quantity:'1',unitPrice:'116',taxRate:'16',taxIncluded:true}),{netBase:'100.00',taxAmount:'16.00',totalAmount:'116.00'});
  assert.deepEqual(lineTotals({quantity:'1',unitPrice:'100',taxRate:'16',taxIncluded:false}),{netBase:'100.00',taxAmount:'16.00',totalAmount:'116.00'});
  assert.deepEqual(lineTotals({quantity:'3',unitPrice:'0.10',taxRate:'0',taxIncluded:false}),{netBase:'0.30',taxAmount:'0.00',totalAmount:'0.30'});
});

test('published phase-1 fixtures match the real request validators and stable UX codes', () => {
  const fixture=JSON.parse(readFileSync(new URL('../__fixtures__/commerce-phase1.json',import.meta.url),'utf8'));
  for(const name of ['openSession','createOrder','addLine','payment','refund','cancel','closeSession'])assert.ok(parse(commandSchemas[name],fixture[name]));
  assert.ok(COMMERCE_ERROR_CODES.includes('REFUND_REQUIRED'));
  assert.ok(COMMERCE_ERROR_CODES.includes('PREPARATION_STATION_REQUIRED'));
});
