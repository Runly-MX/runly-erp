import { useCallback, useEffect, useRef, useState } from 'react'
import { runly } from '../../../lib/runly.js'
import { supabase, createIsolatedRealtimeClient } from '../../../lib/supabase.js'
import { createPresenceStore, createStudioRealtimeSession } from '../lib/studio-realtime.js'

export function useStudioRealtime({id,token,scope,onRevision,onDenied,onChange,instrument=false}) {
  const [participants,setParticipants]=useState([]),[status,setStatus]=useState('Conectando')
  const [presenceStore]=useState(createPresenceStore),session=useRef(null),callbacks=useRef({token,onRevision,onDenied,onChange})
  useEffect(()=>{callbacks.current={token,onRevision,onDenied,onChange}},[token,onRevision,onDenied,onChange])
  useEffect(()=>{
    const current=createStudioRealtimeSession({id,companyId:scope.split(':')[0],getToken:()=>callbacks.current.token,instrument,
      api:(...args)=>runly.studio.collaborationContext(...args),client:supabase,store:presenceStore,
      createSocket:createIsolatedRealtimeClient,
      visible:()=>document.visibilityState!=='hidden',onParticipants:setParticipants,onStatus:setStatus,
      onRevision:(...args)=>callbacks.current.onRevision?.(...args),onDenied:()=>callbacks.current.onDenied?.(),onChange:value=>callbacks.current.onChange?.(value)})
    session.current=current;void current.start()
    const online=()=>{void current.refresh()},visibility=()=>current.visibility()
    window.addEventListener('online',online);document.addEventListener('visibilitychange',visibility)
    return()=>{session.current=null;void current.close();window.removeEventListener('online',online);document.removeEventListener('visibilitychange',visibility)}
  },[id,scope,presenceStore,instrument])
  return {participants,status,presenceStore,diagnostics:useCallback(()=>session.current?.stats(),[]),pointer:useCallback((...args)=>session.current?.pointer(...args),[]),selection:useCallback((...args)=>session.current?.selection(...args),[])}
}
