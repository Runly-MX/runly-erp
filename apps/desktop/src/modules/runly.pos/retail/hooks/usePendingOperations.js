import {useEffect,useState} from 'react'
import {pendingForSession} from '../lib/pendingCommands.js'

export function usePendingOperations({userId,companyId,sessionId,terminalId}){
  const [rows,setRows]=useState([])
  useEffect(()=>{
    const refresh=()=>setRows(pendingForSession({userId,companyId,sessionId,terminalId}))
    refresh()
    window.addEventListener('runly:pos-pending',refresh)
    window.addEventListener('storage',refresh)
    return()=>{window.removeEventListener('runly:pos-pending',refresh);window.removeEventListener('storage',refresh)}
  },[userId,companyId,sessionId,terminalId])
  return rows
}
