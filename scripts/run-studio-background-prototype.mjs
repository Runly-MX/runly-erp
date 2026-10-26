// Explicit, local-only research tool. Not imported by Runly or its startup path.
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads'
import {createRequire} from 'node:module'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'

const sharp=createRequire(new URL('../apps/api/package.json',import.meta.url))('sharp')
const MODEL_SHA256='5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333'

export async function runBackgroundPrototype({input,model,runtime,signal,onProgress=()=>{},timeoutMs=120000}) {
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError')
  const bytes=await readFile(model)
  if(bytes.length!==224005088||createHash('sha256').update(bytes).digest('hex')!==MODEL_SHA256)throw Error('El modelo local no coincide con la versión revisada.')
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError')
  return new Promise((resolveResult,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:{input,model,runtime},execArgv:process.execArgv.filter(arg=>!arg.startsWith('--input-type')),resourceLimits:{maxOldGenerationSizeMb:512}})
    let settled=false
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate().finally(()=>error?reject(error):resolveResult(value))}
    const abort=()=>finish(new DOMException('Cancelado','AbortError'))
    const timer=setTimeout(()=>finish(Error('La segmentación superó el tiempo máximo.')),timeoutMs)
    worker.on('message',message=>{if(message.result)finish(null,message.result);else if(message.error)finish(Error(message.error));else onProgress(message)})
    worker.on('error',error=>finish(error));worker.on('exit',code=>{if(!settled)finish(Error(`El proceso de segmentación terminó (${code}).`))})
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
  })
}

if(!isMainThread){
  try{
    const bytes=await readFile(workerData.input)
    if(bytes.length>10*1024*1024)throw Error('Imagen superior a 10 MB.')
    const original=sharp(bytes,{limitInputPixels:25_000_000}).rotate(),meta=await original.metadata()
    if(!['png','jpeg','webp'].includes(meta.format)||meta.width>8192||meta.height>8192)throw Error('Formato o dimensiones no admitidos.')
    parentPort.postMessage({state:'loading',progress:0.1})
    const ort=createRequire(resolve(workerData.runtime,'package.json'))('onnxruntime-node')
    const session=await ort.InferenceSession.create(workerData.model,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,executionMode:'sequential',graphOptimizationLevel:'basic',enableCpuMemArena:false,enableMemPattern:false})
    const size=1024,{data:rgb}=await original.clone().resize(size,size,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true})
    const input=new Float32Array(3*size*size),mean=[0.485,0.456,0.406],std=[0.229,0.224,0.225]
    for(let i=0;i<size*size;i++)for(let c=0;c<3;c++)input[c*size*size+i]=(rgb[i*3+c]/255-mean[c])/std[c]
    parentPort.postMessage({state:'processing',progress:0.35})
    const started=performance.now(),result=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',input,[1,3,size,size])})
    const inferenceMs=performance.now()-started,output=result[session.outputNames[0]],values=output.data
    if(values.length!==size*size)throw Error('Salida de segmentación no compatible.')
    const alpha=new Uint8Array(values.length);let min=1,max=0
    for(let i=0;i<values.length;i++){const value=1/(1+Math.exp(-Number(values[i])));if(!Number.isFinite(value))throw Error('Máscara no válida.');min=Math.min(min,value);max=Math.max(max,value);alpha[i]=Math.round(value*255)}
    parentPort.postMessage({state:'encoding',progress:0.85})
    const normalized=await original.clone().ensureAlpha().png().toBuffer(),dimensions=await sharp(normalized).metadata()
    const mask=await sharp(alpha,{raw:{width:size,height:size,channels:1}}).resize(dimensions.width,dimensions.height).png().toBuffer()
    const rgba=await sharp(normalized).ensureAlpha().raw().toBuffer(),maskPixels=await sharp(mask).extractChannel(0).raw().toBuffer()
    for(let i=0;i<maskPixels.length;i++)rgba[i*4+3]=Math.round(rgba[i*4+3]*maskPixels[i]/255)
    const png=await sharp(rgba,{raw:{width:dimensions.width,height:dimensions.height,channels:4}}).png().toBuffer()
    if(!(await sharp(png).metadata()).hasAlpha)throw Error('La salida no contiene un canal alfa.')
    await session.release()
    parentPort.postMessage({result:{png,mask,metrics:{inferenceMs,modelBytes:224005088,width:dimensions.width,height:dimensions.height,alphaMin:min,alphaMax:max,maxRssKiB:process.resourceUsage().maxRSS,threads:2}}})
  }catch(error){parentPort.postMessage({error:error.message})}
}else if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const directory=resolve('.artifacts/studio/bg-prototype');await mkdir(directory,{recursive:true})
  const input=process.argv.find(value=>value.startsWith('--input='))?.slice(8)??join(directory,'synthetic-original.png')
  if(['transparent.png','alpha.png','result.json','model.onnx'].some(name=>resolve(input)===join(directory,name)))throw Error('El original debe ser distinto de los archivos de salida y del modelo.')
  if(!process.argv.some(value=>value.startsWith('--input=')))await sharp(Buffer.from('<svg width="768" height="768"><rect width="768" height="768" fill="#d7e8f0"/><ellipse cx="384" cy="700" rx="210" ry="35" fill="#afc7d1"/><circle cx="384" cy="220" r="100" fill="#b88265"/><path d="M270 180Q270 40 390 90Q520 80 490 210Q430 140 270 180" fill="#33221b"/><path d="M200 680L235 420Q250 330 330 335L438 335Q520 330 535 420L568 680Z" fill="#7c3aed"/></svg>')).png().toFile(input)
  const controller=new AbortController(),abort=()=>controller.abort();process.once('SIGINT',abort)
  try{
    const result=await runBackgroundPrototype({input,model:join(directory,'model.onnx'),runtime:directory,signal:controller.signal,onProgress:state=>console.log(JSON.stringify(state))})
    await writeFile(join(directory,'transparent.png'),result.png);await writeFile(join(directory,'alpha.png'),result.mask)
    await writeFile(join(directory,'result.json'),JSON.stringify(result.metrics,null,2));console.log(JSON.stringify(result.metrics))
  }finally{process.removeListener('SIGINT',abort)}
}
