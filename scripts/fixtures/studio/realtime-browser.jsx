import React, { useEffect, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { useStudioRealtime } from '../../../apps/desktop/src/modules/runly.studio/hooks/useStudioRealtime.js'
import { configure, updateToken, runly, supabase } from 'studio-realtime-boundary'
import { createStudioSync } from '../../../apps/desktop/src/modules/runly.studio/lib/studio-sync.js'
import { applyOps } from '../../../apps/shared/studio/operations.js'

let root, current, ticks = 0, latest, interval, sync
const empty=[],subscribe=()=>()=>{},snapshot=()=>empty
function recordPoint(log,point){if(log.length>=20000)log.splice(0,10000);log.push(point)}
function Session({ input }) {
  const live = useStudioRealtime({ id: input.designId, token: input.token, scope: `${input.companyId}:${input.actorId}`,instrument:true,
    onRevision: (revision, canEdit) => { window.revisions.push({ revision, canEdit, at: Date.now() });if(canEdit===false&&sync.state().pending)sync.deny();sync.changed(revision) },
    onDenied: () => { window.denied = true;sync.deny() }, onChange: value => {window.changes.push(value);sync.receive(value)} })
  latest = live
  const rows=useSyncExternalStore(live.presenceStore?.subscribe??subscribe,live.presenceStore?.getSnapshot??snapshot,snapshot)
  useEffect(() => { for (const p of live.presenceStore?rows:live.participants) if (p.x != null) recordPoint(window.receivedPoints,{ sessionId:p.sessionId,userId:p.userId, x:p.x, y:p.y, at:Date.now() }) }, [rows,live.participants,live.presenceStore])
  useEffect(() => { window.ready = true; return () => { window.ready = false } }, [])
  return <div data-status={live.status}>{live.participants.map(p => <span key={p.sessionId} data-session={p.sessionId}>{p.name}</span>)}</div>
}
window.start = async (input, strict = false) => {
  await configure(input); current = input; window.revisions = []; window.changes = []; window.denied = false; window.sentPoints=[];window.receivedPoints=[]
  const record=(await runly.studio.getDesign(input.designId,input.token)).data
  sync=createStudioSync({document:record.document,revision:record.revision,name:record.name,clientId:`fixture-${input.actorId}`,actorId:input.actorId,
    transport:{send:async b=>(await runly.studio.applyChanges(current.designId,b,current.token)).data,fetch:async()=> (await runly.studio.getDesign(current.designId,current.token)).data},editor:{apply:async d=>d},
    storage:window.sessionStorage,storageKey:`fixture-draft:${input.designId}`})
  root = createRoot(document.getElementById('root')); root.render(strict ? <React.StrictMode><Session input={input}/></React.StrictMode> : <Session input={input}/> )
}
window.stop = () => { clearInterval(interval); interval = null; root?.unmount(); root = null;sync?.close() }
window.state = () => ({ participants: latest?.presenceStore?.getSnapshot()??latest?.participants, status: latest?.status, channels: supabase.getChannels().length, ticks, denied: window.denied,diagnostics:latest?.diagnostics?.() })
window.move = (pageId = 'page-1') => { clearInterval(interval); interval = setInterval(() => { ticks++; const point={x:10+ticks%200,y:20+ticks%150};recordPoint(window.sentPoints,{...point,at:Date.now(),userId:current.actorId});latest?.pointer(point, pageId) }, 16) }
window.select = (id, pageId = 'page-1') => latest?.selection(id, pageId)
window.point = (point,pageId='page-1') => latest?.pointer(point,pageId)
window.pause = () => { clearInterval(interval); interval = null }
window.edit = (sequence = 1, pageId = 'page-1') => runly.studio.applyChanges(current.designId, { clientId: `bench-${current.actorId}`, batchId: sequence,
  ops: [{ type: 'patch', pageId, id: pageId === 'page-1' ? 'shape-1' : 'shape-2', set: { x: sequence % 100 + 1 } }] }, current.token)
window.raw = () => supabase
window.syncState=()=>sync.state()
window.localEdit=(id,pageId,x)=>sync.local(applyOps(sync.state().document,[{type:'patch',pageId,id,set:{x}}]))
window.flush=()=>sync.flush()
window.draft=()=>sync.draft('verification')
window.renewToken=async token=>{current={...current,token};await updateToken(token);root.render(<Session input={current}/>)}
window.disconnect=()=>{supabase.realtime.disconnect();for(const c of window.studioSockets??[])c.realtime.disconnect()}
window.reconnect=()=>{supabase.realtime.connect();for(const c of window.studioSockets??[])if(c.getChannels().length)c.realtime.connect()}
window.activeSockets=()=>Number(supabase.realtime.isConnected()&&supabase.getChannels().some(c=>c.topic.includes('studio:design:')))+(window.studioSockets??[]).filter(c=>c.realtime.isConnected()).length
