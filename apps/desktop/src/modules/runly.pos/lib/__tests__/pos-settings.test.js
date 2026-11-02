import {test} from 'node:test'
import assert from 'node:assert/strict'
import {selectPosSettings,settingsPatch} from '../posSettings.js'

test('settings boundary preserves stored modality, false, zero and missing records',()=>{
  const row={mode:'HYBRID',tipsEnabled:false,defaultTaxRate:0,currency:'MXN',pricesIncludeTax:true}
  assert.equal(selectPosSettings({data:row}),row)
  assert.equal(selectPosSettings(row),row)
  assert.equal(selectPosSettings({data:null}),null)
  assert.equal(selectPosSettings(undefined),null)
})

test('a General edit cannot overwrite hidden tax or unedited modality/tips',()=>{
  const original={mode:'HYBRID',tipsEnabled:false,defaultTaxRate:16,pricesIncludeTax:true}
  const patch=settingsPatch('general',{mode:null,tipsEnabled:true,taxRate:'0'})
  assert.deepEqual({...original,...patch},{...original,tipsEnabled:true})
  assert.deepEqual(settingsPatch('general',{mode:null,tipsEnabled:null,taxRate:null}),{})
  assert.deepEqual(settingsPatch('advanced',{mode:'RETAIL',tipsEnabled:true,taxRate:'8.25'}),{defaultTaxRate:8.25})
})

test('invalid/empty taxes never become zero; an explicitly entered zero is valid',()=>{
  for(const taxRate of ['', ' ', 'abc', '16abc', '-1', '101', 'Infinity'])assert.throws(()=>settingsPatch('advanced',{taxRate}),/tasa/)
  assert.deepEqual(settingsPatch('advanced',{taxRate:'0'}),{defaultTaxRate:0})
})
