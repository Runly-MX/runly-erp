import test from 'node:test'
import assert from 'node:assert/strict'
import {responsiveCss} from './responsiveCss.js'
test('only width queries follow the named page container; input and motion keep their semantics',()=>{
  assert.equal(responsiveCss('@media (max-width:900px){.x{display:none}}'),'@container atlas-page (max-width:900px){.x{display:none}}')
  assert.equal(responsiveCss('@media (min-width:560px) and (max-width:900px){a{color:red}}'),'@container atlas-page (min-width:560px) and (max-width:900px){a{color:red}}')
  for(const rule of ['@media (pointer:coarse){a{color:red}}','@media (prefers-reduced-motion:reduce){a{animation:none}}','@media (hover:hover) and (min-width:860px){a{color:red}}'])assert.equal(responsiveCss(rule),rule)
})
