import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {getActiveCompanyId,runly} from '../../../../lib/runly.js'
import {classifyPosError} from '../lib/retailErrors.js'
import {OPEN_STATUSES,orderKey} from '../lib/retailRules.js'
import {createOrderWorkflow,pendingKey} from '../lib/pendingCommands.js'

const lost={kind:'lost',retrySameKey:true,message:'Hay una operaci\u00f3n sin confirmar. Reintenta para recuperar exactamente el intento original.'}
export function useRetailOrder({token,userId,companyId,outletId,terminalId,sessionId}){
  const queryClient=useQueryClient(),storageKey=orderKey(companyId,terminalId)
  const journalKey=pendingKey(userId,companyId,`order:${terminalId}`)
  const [orderId,setOrderId]=useState(()=>localStorage.getItem(storageKey))
  const [pending,setPending]=useState(null),[failure,setFailure]=useState(null)
  const scopeRef=useRef(journalKey),flight=useRef(null)
  useLayoutEffect(()=>{scopeRef.current=journalKey},[journalKey])
  const setOrder=useCallback((dto)=>{
    queryClient.cancelQueries({queryKey:['pos-retail-order',companyId,dto.id,token]},{revert:false})
    queryClient.setQueryData(['pos-retail-order',companyId,dto.id,token],{data:dto})
    localStorage.setItem(storageKey,dto.id)
    if(scopeRef.current===journalKey)setOrderId(dto.id)
  },[companyId,queryClient,token,storageKey,journalKey])
  const workflow=useMemo(()=>createOrderWorkflow({key:journalKey,metadata:{userId,companyId,sessionId,terminalId,prefix:'order'},
    onOrder:setOrder,send:(step)=>{
      if(getActiveCompanyId()!==companyId)throw Object.assign(new Error('La empresa activa cambi\u00f3.'),{code:'company_changed',status:409})
      const options={idempotencyKey:step.key}
      if(step.action==='createOrder')return runly.commerce.createOrder(step.body,token,options)
      if(step.action==='addLine')return runly.commerce.addLine(step.orderId,step.body,token,options)
      return runly.commerce[step.action](step.orderId,step.lineId,step.body,token,options)
    }}),[journalKey,userId,companyId,sessionId,terminalId,token,setOrder])
  useEffect(()=>{
    setOrderId(localStorage.getItem(storageKey))
    setFailure(workflow.read()?lost:null)
  },[storageKey,workflow])
  const query=useQuery({queryKey:['pos-retail-order',companyId,orderId,token],queryFn:()=>runly.commerce.getOrder(orderId,token),
    enabled:Boolean(token&&orderId&&terminalId&&sessionId),staleTime:0,retry:(n,e)=>![401,403,404].includes(e?.status)&&n<2})
  const order=query.data?.data??null
  const usable=order&&order.companyId===companyId&&order.outletId===outletId&&OPEN_STATUSES.includes(order.status)&&order.terminalId===terminalId&&order.sessionId===sessionId?order:null
  const orderRef=useRef(usable)
  useLayoutEffect(()=>{orderRef.current=usable??(orderRef.current?.companyId===companyId&&orderRef.current?.terminalId===terminalId&&orderRef.current?.sessionId===sessionId?orderRef.current:null)},[usable,companyId,terminalId,sessionId])
  useEffect(()=>{
    if(!orderId||!terminalId||!sessionId||workflow.read())return
    if(query.error?.status===404||(order&&!usable)){localStorage.removeItem(storageKey);setOrderId(null)}
  },[orderId,terminalId,sessionId,workflow,query.error,order,usable,storageKey])
  async function run(label,intent,resume=false){
    if(flight.current)return flight.current
    if(!userId||!companyId||!outletId||!terminalId||(!sessionId&&!resume))return null
    setPending(label);setFailure(null)
    flight.current=(async()=>{
      try{return await(resume?workflow.resume():workflow.start(intent()))}
      catch(error){
        if(scopeRef.current===journalKey){setFailure({...classifyPosError(error),label});if(error.code==='ORDER_VERSION_CONFLICT')await query.refetch()}
        return null
      }finally{if(scopeRef.current===journalKey)setPending(null);flight.current=null}
    })()
    return flight.current
  }
  const start=(label,steps)=>run(label,()=>({order:orderRef.current,steps:steps(orderRef.current)}))
  function create(){return{action:'createOrder',input:{outletId,terminalId,sessionId,experience:'RETAIL',fulfillmentType:'TAKEAWAY'}}}
  return{
    order:usable,loading:Boolean(orderId)&&query.isPending,pending,failure,setOrder,
    addItem:(item,label)=>start(label??`Agregando ${item.name}`,(o)=>{
      const line=o?.lines?.find((l)=>!l.voided&&l.productId===item.productId&&(l.variantId??null)===(item.variantId??null))
      if(line)return[{action:'updateLine',lineId:line.id,input:{quantity:String(Number(line.quantity)+1)}}]
      return[...(!o?[create()]:[]),{action:'addLine',input:{productId:item.productId,...(item.variantId?{variantId:item.variantId}:{}),quantity:'1'}}]
    }),
    addCustom:({name,unitPrice})=>start(`Agregando ${name}`,(o)=>[...(!o?[create()]:[]),{action:'addLine',input:{customItem:{name,unitPrice},quantity:'1'}}]),
    setQuantity:(line,quantity)=>start('Actualizando cantidad',()=>[{action:'updateLine',lineId:line.id,input:{quantity:String(quantity)}}]),
    removeLine:(line)=>start('Quitando art\u00edculo',()=>[{action:'deleteLine',lineId:line.id,input:{}}]),
    discountLine:(line,amount,reason)=>start('Aplicando descuento',()=>[{action:'discount',lineId:line.id,input:{amount,reason}}]),
    clear:()=>start('Vaciando venta',(o)=>(o?.lines??[]).filter((l)=>!l.voided).map((l)=>({action:'deleteLine',lineId:l.id,input:{}}))),
    retry:()=>run('Recuperando operaci\u00f3n',null,true),dismissFailure:()=>setFailure(null),
    reload:async()=>{if(workflow.read())await run('Recuperando operaci\u00f3n',null,true);else setFailure(null);return query.refetch()},
    finish:()=>{orderRef.current=null;localStorage.removeItem(storageKey);setOrderId(null)},
  }
}
