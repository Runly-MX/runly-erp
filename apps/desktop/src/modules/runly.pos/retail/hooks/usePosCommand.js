import {useEffect,useMemo,useRef,useState} from 'react'
import {useMutation} from '@tanstack/react-query'
import {useAuth} from '../../../../auth/AuthProvider.jsx'
import {useActiveCompany} from '../../../../company/ActiveCompanyProvider'
import {classifyPosError} from '../lib/retailErrors.js'
import {createPendingCommand,pendingKey} from '../lib/pendingCommands.js'

export function usePosCommand({prefix,scope,sessionId,terminalId,run,onSuccess,onError}){
  const {userProfile}=useAuth(),{activeCompanyId}=useActiveCompany()
  const store=useMemo(()=>createPendingCommand({key:pendingKey(userProfile?.id,activeCompanyId,`${prefix}:${scope}`),
    metadata:{userId:userProfile?.id,companyId:activeCompanyId,prefix,scope,sessionId,terminalId}}),[userProfile?.id,activeCompanyId,prefix,scope,sessionId,terminalId])
  const [failure,setFailure]=useState(null),flight=useRef(null)
  useEffect(()=>{setFailure(store.read()?{kind:'lost',retrySameKey:true,message:'Hay un intento sin confirmar. Reintenta para recuperar el resultado original.'}:null)},[store])
  const mutation=useMutation({
    mutationFn:(body)=>{
      if(!userProfile?.id||!activeCompanyId||!scope)throw Object.assign(new Error('Contexto requerido.'),{code:'FORBIDDEN',status:403})
      return store.execute(body,run)
    },
    onMutate:()=>setFailure(null),
    onSuccess:(result,body)=>onSuccess?.(result,body),
    onError:(error,body)=>{const info=classifyPosError(error);setFailure(info);onError?.(info,body)},
  })
  function mutate(body){
    if(flight.current)return flight.current
    flight.current=mutation.mutateAsync(body).catch(()=>null).finally(()=>{flight.current=null})
    return flight.current
  }
  return{...mutation,mutate,failure,clearFailure:()=>setFailure(null),retry:()=>{const record=store.read();if(record)return mutate(record.body)}}
}
