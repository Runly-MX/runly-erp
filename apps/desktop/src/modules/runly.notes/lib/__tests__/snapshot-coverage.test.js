import test from 'node:test'
import assert from 'node:assert/strict'
import { coversSnapshot, throttle } from '../canvasSync.js'

const scene = () => ({ elements:[{id:'a',version:2,versionNonce:20},{id:'deleted',version:3,versionNonce:30,isDeleted:true}], layers:[{id:'layer',order:0}], files:{image:{storageKey:'example/image'}}, appState:{gridSize:20} })
test('response suppression requires every version/tombstone, file and layer order', () => {
  const local=scene(),received=structuredClone(local)
  assert.equal(coversSnapshot(received,local),true)
  received.elements[0].version=1;assert.equal(coversSnapshot(received,local),false)
  received.elements[0].version=2;received.elements[0].versionNonce=21;assert.equal(coversSnapshot(received,local),false)
  received.elements[0].version=3;assert.equal(coversSnapshot(received,local),true)
  received.elements.pop();assert.equal(coversSnapshot(received,local),false)
  assert.equal(coversSnapshot({...scene(),files:{}},local),false)
  assert.equal(coversSnapshot({...scene(),layers:[{id:'layer',order:1}]},local),false)
  assert.equal(coversSnapshot({...scene(),appState:{gridSize:30}},local),false)
  assert.equal(coversSnapshot({...scene(),elements:[null]},local),false)
})

test('scene/pointer/layer throttles release pending callbacks on destroy', context => {
  context.mock.timers.enable({apis:['Date','setTimeout'],now:1000})
  const calls=[],send=throttle(value=>calls.push(value),50)
  send('first');send('trailing');send.cancel();context.mock.timers.tick(100)
  assert.deepEqual(calls,['first'])
})
