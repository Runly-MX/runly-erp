import test from 'node:test'
import assert from 'node:assert/strict'
import {serve} from '@hono/node-server'
import {createStudioRouter} from './index.js'

test('a real disconnected HTTP client aborts PDF processing before final authorization',async()=>{
  let started,stopped,reads=0
  const entered=new Promise(r=>{started=r}),cancelled=new Promise(r=>{stopped=r})
  const app=createStudioRouter({service:{access:{get:async()=>{reads++;return {revision:1,document:{objects:[]}}}}},
    requirePermission:()=>async(_,next)=>next(),printBuilder:({signal})=>new Promise((_,reject)=>{
      signal.addEventListener('abort',()=>{stopped();reject(new DOMException('cancelled','AbortError'))},{once:true});started()
    })})
  let server
  await new Promise(resolve=>{server=serve({fetch:app.fetch,hostname:'127.0.0.1',port:0},resolve)})
  const controller=new AbortController(),form=new FormData();form.set('file',new File(['synthetic'],'render.png'));form.set('revision','1')
  try{
    const request=fetch(`http://127.0.0.1:${server.address().port}/studio/designs/test/export/print-pdf`,{method:'POST',body:form,signal:controller.signal})
    await entered;controller.abort();await assert.rejects(request,{name:'AbortError'})
    let timer
    try{await Promise.race([cancelled,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Server did not observe disconnect')),2000)})])}finally{clearTimeout(timer)}
    assert.equal(reads,1)
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})
