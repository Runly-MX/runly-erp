import test from 'node:test';
import assert from 'node:assert/strict';
import {updateVariantSchema,updateCategorySchema,updateProductSchema} from '../validators.js';

test('D36 PATCH schemas preserve omissions, explicit null, zero and empty objects',()=>{
  for(const value of [{},{sku:'X'},{barcode:'00012'},{option_values:{Talla:'Chica'}},{option_values:{}},{price:null},{price:0},{compare_price:null},{sku:null},{barcode:null}])assert.deepEqual(updateVariantSchema.parse(value),value);
  assert.deepEqual(updateCategorySchema.parse({name:'X'}),{name:'X'});
  assert.deepEqual(updateProductSchema.parse({sku:'X'}),{sku:'X'});
  for(const value of [{price:-1},{price:'0'},{option_values:null},{option_values:{Talla:1}},{stock:1},{enabled:true},{sku:3},{barcode:[]},{expectedVersion:0}])assert.equal(updateVariantSchema.safeParse(value).success,false,JSON.stringify(value));
});
