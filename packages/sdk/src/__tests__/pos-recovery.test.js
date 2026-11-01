import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunlyClient } from '../index.js';
import { createPosRecoveryDomain } from '../domains/pos-recovery.js';

test('commerce SDK carries stable keys, active company, expectedVersion and decimal amounts', async () => {
  const seen = [];
  const client = createRunlyClient({ baseUrl: 'https://example.test', getActiveCompanyId: () => 'company-a',
    fetch: async (url, options) => { seen.push({ url, options }); return Response.json({ data: { ok: true } }); } });
  const data = { expectedVersion: 3, amount: '100.00', tenderedAmount: '200.00' };
  const options = { idempotencyKey: 'commerce-attempt-0001' };
  await client.commerce.addPayment('order', data, 'test-token', options);
  await client.commerce.addPayment('order', data, 'test-token', options);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].url, 'https://example.test/pos/v2/orders/order/payments');
  assert.deepEqual(seen[0], seen[1]);
  assert.equal(seen[0].options.headers['Idempotency-Key'], options.idempotencyKey);
  assert.equal(seen[0].options.headers['X-Runly-Company-Id'], 'company-a');
  assert.deepEqual(JSON.parse(seen[0].options.body), data);
  await assert.rejects(client.commerce.addPayment('order', data, 'test-token'), { code: 'IDEMPOTENCY_REQUIRED' });
  assert.equal(seen.length, 2);
});

test('SDK exposes structured commerce errors', async () => {
  const client = createRunlyClient({ baseUrl: 'https://example.test', fetch: async () => Response.json({ error: {
    code: 'REFUND_REQUIRED', message: 'Devuelve el anticipo.' }, requestId: 'support-example' }, { status: 409 }) });
  await assert.rejects(client.commerce.cancel('order', { expectedVersion: 1, reason: 'Error' }, 'test-token', { idempotencyKey: 'commerce-attempt-0002' }),
    (err) => err.code === 'REFUND_REQUIRED' && err.message === 'Devuelve el anticipo.' && err.requestId === 'support-example' && err.status === 409);
});

test('commerce commands set onlineOnly including DELETE and preserve caller keys', async () => {
  const calls = [];
  const domain = createPosRecoveryDomain({ request: async (...args) => calls.push(args), withAuthHeaders: (_token, headers) => headers, toQueryString: () => '' });
  await domain.addPayment('order', {}, 'test-token', { idempotencyKey: 'commerce-attempt-0003' });
  await domain.deleteLine('order','line',{expectedVersion:1},'test-token',{ idempotencyKey: 'commerce-attempt-0004' });
  assert.ok(calls.every(([,options])=>options.onlineOnly===true));
  assert.equal(calls[1][1].method,'DELETE');
});

test('phase 2 SDK exposes scoped catalog reads, keyed stock commands and read-only refund preview', async () => {
  const seen=[];
  const client=createRunlyClient({baseUrl:'https://example.test',getActiveCompanyId:()=> 'company-a',fetch:async(url,options)=>{seen.push({url,options});return Response.json({data:{ok:true}});}});
  await client.commerce.sellables({outletId:'outlet',page:2,search:'000123'},'token');
  await client.commerce.categories({outletId:'outlet'},'token');
  await client.commerce.variants('product',{outletId:'outlet'},'token');
  await client.commerce.scan({outletId:'outlet',code:'000123'},'token');
  await client.commerce.refundPreview('order',{expectedVersion:2,lines:[]},'token');
  await client.catalogCommerce.stockBalances('product',{outletId:'outlet'},'token');
  await client.catalogCommerce.stockMovements('product',{limit:50},'token');
  const options={idempotencyKey:'catalog-attempt-0001'};
  await client.catalogCommerce.allocateStock('product',{outletId:'outlet',quantity:2,reason:'Asignacion'},'token',options);
  await client.catalogCommerce.adjustStock('product',{outletId:'outlet',quantityDelta:-1,reason:'Correccion'},'token',options);
  await client.catalogCommerce.availability('product',{},'token');
  await client.catalogCommerce.setAvailability('product',{enabled:false},'token',options);
  await client.catalogCommerce.commercialTax('product','token');
  await client.catalogCommerce.setCommercialTax('product',{rate:null,included:null},'token',options);
  assert.match(seen[0].url,/sellables\?.*outletId=outlet/);
  assert.match(seen[2].url,/sellables\/product\/variants/);
  assert.match(seen[3].url,/code=000123/);
  assert.match(seen[4].url,/orders\/order\/refunds\/preview$/);
  assert.equal(seen[4].options.method,'POST');
  assert.equal(seen[4].options.headers['Idempotency-Key'],undefined);
  assert.ok(seen.every(({options})=>options.headers['X-Runly-Company-Id']==='company-a'));
  for(const i of [7,8,10,12])assert.equal(seen[i].options.headers['Idempotency-Key'],options.idempotencyKey);
  assert.equal(seen[10].options.method,'PUT');
  await assert.rejects(client.catalogCommerce.adjustStock('product',{},'token'),{code:'IDEMPOTENCY_REQUIRED'});
  assert.equal(seen.length,13);
});

test('C7 SDK uses real receipt/session paths, online transport and stable print/result keys',async()=>{
  const calls=[];
  const domain=createPosRecoveryDomain({request:async(...args)=>{calls.push(args);return{data:{ok:true}};},withAuthHeaders:(_token,headers={})=>headers,toQueryString:(q)=>q?'?'+new URLSearchParams(q):''});
  await domain.currentSession({outletId:'outlet',terminalId:'terminal'},'token');
  await domain.getSession('session','token');await domain.getReceipt('receipt','token');
  const options={idempotencyKey:'retail-print-attempt-0001'};
  await domain.createPrintJob('receipt',{transport:'BROWSER'},'token',options);
  await domain.createPrintJob('receipt',{transport:'BROWSER'},'token',options);
  await domain.finishPrintJob('job',{status:'FAILED',errorCode:'PRINTER_ABSENT'},'token',options);
  assert.match(calls[0][0],/sessions\/current\?outletId=outlet&terminalId=terminal/);
  assert.equal(calls[1][0],'/pos/v2/sessions/session');assert.equal(calls[2][0],'/pos/v2/receipts/receipt');
  assert.deepEqual(calls[3],calls[4]);assert.equal(calls[5][0],'/pos/v2/print-jobs/job/result');
  assert.equal(calls[5][1].headers['Idempotency-Key'],options.idempotencyKey);
  assert.ok(calls.every(([,o])=>o.onlineOnly));
  assert.deepEqual([...domain.printDataBytes({encoding:'base64',charset:'US-ASCII',dataBase64:btoa('TOTAL 100\n')})],[...new TextEncoder().encode('TOTAL 100\n')]);
  assert.throws(()=>domain.printDataBytes({}),{code:'VALIDATION_ERROR'});
  assert.throws(()=>domain.printDataBytes({encoding:'base64',charset:'US-ASCII',dataBase64:'***'}),{code:'VALIDATION_ERROR'});
  await assert.rejects(domain.createPrintJob('receipt',{},'token'),{code:'IDEMPOTENCY_REQUIRED'});
});
