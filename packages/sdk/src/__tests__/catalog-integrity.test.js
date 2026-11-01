import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunlyClient} from '../index.js';

test('catalog creates preserve caller keys across lost-response retries and reject unkeyed calls',async()=>{
  const calls=[];
  const client=createRunlyClient({baseUrl:'https://example.test',getActiveCompanyId:()=> 'company',fetch:async(url,options)=>{calls.push({url,options});return Response.json({data:{id:'created'}});}});
  const options={idempotencyKey:'catalog-create-attempt-0001'};
  await client.catalog.createProduct({name:'A',slug:'a'},'token',options);
  await client.catalog.createProduct({name:'A',slug:'a'},'token',options);
  assert.deepEqual(calls[0],calls[1]);
  await client.catalog.createVariant('product',{price:null},'token',options);
  assert.equal(calls[2].options.headers['Idempotency-Key'],options.idempotencyKey);
  assert.equal(calls[2].options.headers['X-Runly-Company-Id'],'company');
  await assert.rejects(client.catalog.createProduct({},'token'),{code:'IDEMPOTENCY_REQUIRED'});
  await assert.rejects(client.catalog.createVariant('product',{},'token'),{code:'IDEMPOTENCY_REQUIRED'});
  assert.equal(calls.length,3);
});

test('catalog SDK sends sparse PATCH and explicit revision; legacy signatures obtain a precondition',async()=>{
  const calls=[];
  const client=createRunlyClient({baseUrl:'https://example.test',fetch:async(url,options)=>{calls.push({url,options});return Response.json({data:{revision:9,variants:[{id:'variant',revision:7}]}});}});
  await client.catalog.updateVariant('product','variant',{sku:'X'},'token',{expectedVersion:2});
  assert.deepEqual(JSON.parse(calls[0].options.body),{sku:'X',expectedVersion:2});
  await client.catalog.updateProduct('product',{price:0},'token',{expectedVersion:3});
  assert.deepEqual(JSON.parse(calls[1].options.body),{price:0,expectedVersion:3});
  await client.catalog.updateVariant('product','variant',{barcode:'0001'},'token');
  assert.equal(calls[2].options.method,undefined);
  assert.deepEqual(JSON.parse(calls[3].options.body),{barcode:'0001',expectedVersion:7});
  const old=createRunlyClient({baseUrl:'https://example.test',fetch:async()=>Response.json({data:{variants:[{id:'variant'}]}})});
  await assert.rejects(old.catalog.updateVariant('product','variant',{sku:'X'},'token'),{code:'PRECONDITION_REQUIRED'});
});
