import { useSyncExternalStore } from 'react'
import { RemotePresence } from './RemotePresence.jsx'
import { groupParticipants, selectionsByObject } from '../../../lib/studio-presence.js'
const empty=[],none=()=>()=>{},snapshot=()=>empty

// Only this overlay observes the high-frequency cursor store.
export function LiveRemotePresence({store,pageId,selfId,people,selections,...props}) {
  const rows=useSyncExternalStore(store?.subscribe??none,store?.getSnapshot??snapshot,snapshot)
  if(!store)return <RemotePresence people={people} selections={selections} {...props}/>
  const visible=rows.filter(p=>p.pageId===pageId)
  return <RemotePresence people={groupParticipants(visible,selfId)} selections={selectionsByObject(visible,selfId)} {...props}/>
}
