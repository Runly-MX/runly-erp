import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {commandSchemas,parse,COMMERCE_ERROR_CODES,KITCHEN_UNDO_WINDOW_MS,RESTAURANT_LATE_AFTER_MINUTES} from '../pos-contracts.js';

test('published C6 fixtures use executable schemas and the definitive error/state vocabulary',()=>{
  const fixture=JSON.parse(readFileSync(new URL('../__fixtures__/commerce-phase4.json',import.meta.url)));
  for(const [action,body] of Object.entries(fixture.commands))assert.deepEqual(parse(commandSchemas[action],body),body);
  assert.deepEqual(parse(commandSchemas.kitchenLine,fixture.undo),fixture.undo);
  assert.equal(KITCHEN_UNDO_WINDOW_MS,5000);assert.equal(RESTAURANT_LATE_AFTER_MINUTES,fixture.ticketFields.lateAfterMinutes);
  for(const code of ['TABLE_OCCUPIED','ALLOCATION_CONFLICT','PREPARATION_ALREADY_DISPATCHED','UNDO_NOT_ALLOWED'])assert.ok(COMMERCE_ERROR_CODES.includes(code));
  assert.throws(()=>parse(commandSchemas.dispatch,{...fixture.commands.dispatch,outletId:fixture.commands.createTable.outletId}),{code:'VALIDATION_ERROR'});
  assert.throws(()=>parse(commandSchemas.kitchenLine,{expectedVersion:1,status:'CANCELLED'}),{code:'VALIDATION_ERROR'});
});
