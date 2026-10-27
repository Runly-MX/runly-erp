import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const api=createRequire(new URL('../../../../../api/package.json',import.meta.url))
const supabase=createRequire(api.resolve('@supabase/supabase-js'))
const realtime=createRequire(supabase.resolve('@supabase/realtime-js'))
const {default:Adapter}=realtime('./phoenix/presenceAdapter.js')
const {Presence}=realtime('@supabase/phoenix')

test('native SDK Presence callbacks preserve Phoenix references and 150 renewals retain only one current meta',()=>{
  let state={}
  for(let seq=1;seq<=150;seq++){
    const next={metas:[{phx_ref:String(seq),payload:{seq}}]}
    const original=structuredClone(next)
    state=Presence.syncDiff(state,{joins:{session:next},leaves:seq>1?{session:{metas:[{phx_ref:String(seq-1)}]}}:{}},
      (key,current,joined)=>Adapter.onJoinPayload(key,current,joined),
      (key,current,left)=>Adapter.onLeavePayload(key,current,left))
    assert.deepEqual(next,original,'Public callback mutated the native tracker input')
    assert.equal(state.session.metas.length,1,'Historical metas accumulated')
    assert.equal(Adapter.transformState(state).session[0].payload.seq,seq)
  }
  state=Presence.syncDiff(state,{joins:{},leaves:{session:{metas:[{phx_ref:'150'}]}}},
    (key,current,joined)=>Adapter.onJoinPayload(key,current,joined),
    (key,current,left)=>Adapter.onLeavePayload(key,current,left))
  assert.deepEqual(state,{})
})
