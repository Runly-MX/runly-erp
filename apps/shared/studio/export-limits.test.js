import test from 'node:test'
import assert from 'node:assert/strict'
import {exportDimensions} from './export-limits.js'
import {requireStudioProtocol} from './protocol.js'
test('export dimensions are exact at x1/x2/x3; limits reject instead of downsampling',()=>{
  for(const scale of [1,2,3])assert.deepEqual(exportDimensions({width:640,height:480},scale),{width:640*scale,height:480*scale,scale})
  assert.throws(()=>exportDimensions({width:4096,height:4096},3),/no se redujo/)
  assert.throws(()=>exportDimensions({width:4096,height:4096},NaN))
  assert.throws(()=>exportDimensions({width:4096,height:4096},1,-1))
  assert.equal(exportDimensions({width:601,height:401},1.25).width,752)
})
test('an absent or old protocol cannot authorize new-client writes',()=>{
  for(const value of [null,{version:1},{version:'2'},{}])assert.throws(()=>requireStudioProtocol(value),{status:426})
  assert.equal(requireStudioProtocol({version:2}).version,2)
})
