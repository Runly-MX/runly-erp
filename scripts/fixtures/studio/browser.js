import './shape-engine.js'
import './advanced-composition.js'
import { createStudioEditor } from '../../../apps/desktop/src/modules/runly.studio/lib/fabric-adapter.js'
import { Canvas2DRenderer } from '../../../apps/desktop/src/modules/runly.canvas/engine/Canvas2DRenderer.js'
import { LIGHT_THEME } from '../../../apps/desktop/src/modules/runly.canvas/engine/theme.js'
import { appendObject, blankDocument } from '../../../apps/shared/studio/document.js'
import { Rect, Ellipse } from 'fabric'
import { STUDIO_FONTS } from '../../../apps/shared/studio/fonts.js'
import './photo-engine.js'

const fileId = '00000000-0000-4000-8000-000000000005'
window.studioVerification = async () => {
  const element = () => { const canvas = document.createElement('canvas'); document.body.append(canvas); return canvas }
  const original = document.createElement('canvas'); original.width = 40; original.height = 24
  original.getContext('2d').fillStyle = '#f59e0b'; original.getContext('2d').fillRect(0, 0, 40, 24)
  const imageUrl = original.toDataURL()
  const resolveImage = async () => imageUrl
  let editor = await createStudioEditor(element(), { document: blankDocument(640, 480), resolveImage })
  await editor.add('text', { text: 'Diseño editable', x: 10, y: 10 })
  editor.patch({ text: 'Texto modificado', x: 24, y: 30, rotation: 12, scaleX: 1.4, scaleY: 0.8 })
  await editor.add('rectangle', { x: 30, y: 300, width: 100, height: 80, fill: '#2563eb' })
  await editor.add('ellipse', { x: 300, y: 300, width: 100, height: 80 })
  await editor.add('image', { x: 450, y: 50, width: 80, height: 48, fileAssetId: fileId })
  const saved = JSON.parse(JSON.stringify(editor.snapshot()))
  const beforeBlob = await editor.exportPng()
  await editor.destroy()
  editor = await createStudioEditor(element(), { document: saved, resolveImage })
  const reopened = editor.snapshot(), exported = await editor.exportPng()
  const png = await createImageBitmap(exported)
  const pixels = document.createElement('canvas'); pixels.width = png.width; pixels.height = png.height
  const ctx = pixels.getContext('2d'); ctx.drawImage(png, 0, 0)
  const result = { saved, reopened, png: { width: png.width, height: png.height, bytes: exported.size,
    blue: [...ctx.getImageData(50, 320, 1, 1).data], image: [...ctx.getImageData(470, 70, 1, 1).data] },
    identicalPng: beforeBlob.size === exported.size }
  png.close()
  for (const [index, patch] of [[0, { text: 'Cambio para historial', x: 90 }], [1, { width: 180, rotation: 30 }], [3, { width: 200, rotation: 45 }]]) {
    const before = editor.snapshot()
    editor.select(before.objects[index].id); editor.patch(patch)
    const after = editor.snapshot()
    await editor.undo()
    if (JSON.stringify(editor.snapshot()) !== JSON.stringify(before)) throw Error('history did not restore object properties')
    await editor.redo()
    if (JSON.stringify(editor.snapshot()) !== JSON.stringify(after)) throw Error('redo lost object properties')
    await editor.undo()
  }
  editor.select(saved.objects[1].id)
  await editor.duplicate()
  const duplicate = editor.snapshot().objects.at(-1)
  if (duplicate.id === saved.objects[1].id || editor.snapshot().objects.length !== 5) throw Error('duplicate failed')
  await editor.undo()
  if (editor.snapshot().objects.length !== 4) throw Error('undo duplicate failed')
  await editor.redo()
  if (editor.snapshot().objects.length !== 5) throw Error('redo duplicate failed')
  editor.select(duplicate.id); editor.order('back')
  if (editor.snapshot().objects[0].id !== duplicate.id) throw Error('layer ordering failed')
  editor.order('front'); editor.order('down')
  if (editor.snapshot().objects.at(-2).id !== duplicate.id) throw Error('lower layer failed')
  editor.order('up')
  if (editor.snapshot().objects.at(-1).id !== duplicate.id) throw Error('raise layer failed')
  editor.order('back')
  editor.patch({ locked: true }); editor.patch({ x: 999 })
  if (editor.snapshot().objects[0].x === 999) throw Error('locked transform changed')
  editor.patch({ locked: false, hidden: true })
  if (!editor.snapshot().objects[0].hidden) throw Error('visibility lost')
  await editor.undo()
  if (editor.snapshot().objects[0].hidden) throw Error('undo visibility failed')
  result.historyAndLayers = true
  await editor.destroy()
  editor = await createStudioEditor(element(), { document: blankDocument(640, 480), resolveImage })
  await editor.add('rectangle', { x: 60, y: 80, width: 120, height: 50, rotation: 35 })
  await editor.add('ellipse', { x: 300, y: 160, width: 70, height: 90 })
  await editor.add('rectangle', { x: 450, y: 280, width: 50, height: 50 })
  await editor.add('rectangle', { x: 25, y: 25, locked: true })
  await editor.add('rectangle', { x: 30, y: 30, hidden: true })
  const composition = editor.snapshot(), ids = composition.objects.map(object => object.id)
  editor.selectMany(ids)
  if (JSON.stringify(editor.snapshot()) !== JSON.stringify(composition)) throw Error('Selecting objects changed document coordinates')
  await editor.align('left', 'selection')
  const aligned = editor.snapshot()
  if (aligned.objects[0].rotation !== 35 || aligned.objects[3].x !== 25 || aligned.objects[4].x !== 30) throw Error('Alignment modified protected objects or rotation')
  const visualBounds = item => (item.type === 'ellipse' ? new Ellipse({ left:item.x,top:item.y,rx:item.width/2,ry:item.height/2,angle:item.rotation }) : new Rect({ left:item.x,top:item.y,width:item.width,height:item.height,angle:item.rotation })).getBoundingRect()
  const lefts=aligned.objects.slice(0,3).map(item=>visualBounds(item).left)
  if (Math.max(...lefts)-Math.min(...lefts)>1e-8) throw Error('Rotated objects are not visually aligned')
  await editor.undo()
  if (JSON.stringify(editor.snapshot()) !== JSON.stringify(composition)) throw Error('Alignment undo is not atomic')
  for(const action of ['left','center','right','top','middle','bottom']) {
    editor.select(ids[0]);await editor.align(action,'page')
    const box=visualBounds(editor.snapshot().objects[0])
    const actual={left:box.left,center:box.left+box.width/2,right:box.left+box.width,top:box.top,middle:box.top+box.height/2,bottom:box.top+box.height}[action]
    const expected={left:0,center:320,right:640,top:0,middle:240,bottom:480}[action]
    if(Math.abs(actual-expected)>1e-8)throw Error(`Visual ${action} alignment failed`)
    await editor.undo()
  }
  editor.selectMany(ids.slice(0,3)); await editor.align('distribute-x','selection')
  const distributed = editor.snapshot()
  const boxes=distributed.objects.slice(0,3).map(visualBounds).sort((a,b)=>a.left-b.left)
  if(Math.abs((boxes[1].left-boxes[0].left-boxes[0].width)-(boxes[2].left-boxes[1].left-boxes[1].width))>1e-8)throw Error('Horizontal distribution has uneven visual gaps')
  await editor.undo(); await editor.redo()
  if (JSON.stringify(editor.snapshot()) !== JSON.stringify(distributed)) throw Error('Distribution redo lost geometry')
  const beforeResize = editor.snapshot()
  await editor.resize({ width: 800, height: 600, background: '#f97316' })
  if (JSON.stringify(editor.snapshot().objects) !== JSON.stringify(beforeResize.objects)) throw Error('Resize moved objects without consent')
  const orange=await createImageBitmap(await editor.exportImage('jpg',0.9)),orangeCanvas=element()
  orangeCanvas.width=800;orangeCanvas.height=600;orangeCanvas.getContext('2d').drawImage(orange,0,0)
  const orangePixel=[...orangeCanvas.getContext('2d').getImageData(799,599,1,1).data];orange.close()
  if(Math.abs(orangePixel[0]-249)>8 || Math.abs(orangePixel[1]-115)>8 || orangePixel[3]!==255)throw Error('JPG alternate background failed')
  await editor.undo()
  if (JSON.stringify(editor.snapshot()) !== JSON.stringify(beforeResize)) throw Error('Resize undo failed')
  await editor.resize({ width: 320, height: 240, background: '#84cc16' }, true)
  if (editor.snapshot().objects[0].x !== beforeResize.objects[0].x / 2) throw Error('Uniform resize did not scale coordinates')
  const jpegBlob = await editor.exportImage('jpg',0.9), jpeg = await createImageBitmap(jpegBlob)
  if (jpegBlob.type !== 'image/jpeg' || jpeg.width !== 320 || jpeg.height !== 240) throw Error('Invalid JPEG export')
  const opaque = element(); opaque.width = 320; opaque.height = 240
  opaque.getContext('2d').drawImage(jpeg,0,0)
  const background = [...opaque.getContext('2d').getImageData(319,239,1,1).data]
  if (Math.abs(background[0]-132)>8 || Math.abs(background[1]-204)>8 || background[3]!==255) throw Error('JPG background is not opaque/exact')
  jpeg.close(); result.composition = { multiSelection: true, resizeHistory: true, alignmentDistribution: true, jpg: { width:320,height:240,bytes:jpegBlob.size,background } }
  await editor.destroy()
  let imageFailure
  try {
    await createStudioEditor(element(), { document: appendObject(blankDocument(), 'image', { fileAssetId: fileId }),
      resolveImage: async () => 'data:image/png;base64,bm90LWFuLWltYWdl#token=private-test-value' })
  } catch (error) { imageFailure = error.message }
  if (!imageFailure || imageFailure.includes('token=') || imageFailure.includes('data:')) throw Error('image failure exposed its URL')
  result.safeImageErrors = true
  let available=true
  editor=await createStudioEditor(element(),{document:appendObject(blankDocument(64,64),'image',{fileAssetId:fileId,width:40,height:24}),resolveImage:async()=>{if(!available)throw Error('private-test-url?token=never-disclose');return imageUrl}})
  const protectedScene=JSON.stringify(editor.snapshot());available=false
  let blockedExport
  try{await editor.exportImage('jpg',0.9)}catch(error){blockedExport=error.message}
  if(!blockedExport || blockedExport.includes('token=') || JSON.stringify(editor.snapshot())!==protectedScene)throw Error('Export failed to protect an unavailable original')
  available=true
  if((await editor.exportImage('jpg',0.9)).type!=='image/jpeg')throw Error('Export retry did not recover')
  await editor.destroy();result.exportRecovery=true
  let releaseOriginal,signalOriginal,gate=false
  const originalStarted=new Promise(resolve=>{signalOriginal=resolve})
  editor=await createStudioEditor(element(),{document:appendObject(blankDocument(64,64),'image',{fileAssetId:fileId,width:40,height:24}),resolveImage:async()=>{
    if(gate){signalOriginal();return new Promise(resolve=>{releaseOriginal=()=>resolve(imageUrl)})}return imageUrl
  }})
  const reviewed=editor.snapshot();editor.select(reviewed.objects[0].id);gate=true
  const frozenExport=editor.exportImage('png',1,reviewed);await originalStarted
  let mutationDenied=false
  try{editor.patch({x:12})}catch(error){mutationDenied=error.message.includes('exportación')}
  if(!mutationDenied)throw Error('Scene changed while exporting authorized originals')
  editor.setReadOnly(true);releaseOriginal();await frozenExport
  let stillRevoked=false;try{editor.patch({x:20})}catch(error){stillRevoked=error.message.includes('solo lectura')}
  if(!stillRevoked)throw Error('Export restored write access after revocation')
  editor.setReadOnly(false);editor.select(reviewed.objects[0].id);editor.patch({x:20});let staleCredits=false
  try{await editor.exportImage('png',1,reviewed)}catch(error){staleCredits=error.message.includes('créditos')}
  if(!staleCredits)throw Error('Export accepted credits from a different scene')
  await editor.destroy();result.exportIsolation={frozen:true,revocationPreserved:true,staleCreditsRejected:true}
  let releaseInsertion,signalInsertion
  const inserting=new Promise(resolve=>{signalInsertion=resolve})
  editor=await createStudioEditor(element(),{document:blankDocument(100,100),resolveImage:async()=>{signalInsertion();return new Promise(resolve=>{releaseInsertion=()=>resolve(imageUrl)})}})
  const insertion=editor.add('image',{fileAssetId:fileId,width:40,height:24});await inserting
  editor.setReadOnly(true);releaseInsertion();let insertDenied=false
  try{await insertion}catch(error){insertDenied=error.message.includes('solo lectura')}
  if(!insertDenied||editor.snapshot().objects.length)throw Error('Revoked asynchronous image insertion changed the scene')
  await editor.destroy();result.revokedInsertion=true
  editor=await createStudioEditor(element(),{document:blankDocument(400,200),resolveImage})
  await editor.add('vector',{iconId:'tabler:square',x:20,y:20,width:80,height:80,geometry:{width:24,height:24,paths:[{d:'M0 0H24V24H0Z',fill:'color',stroke:'none',strokeWidth:0,cap:'butt',join:'miter'}]}})
  editor.patch({fill:'#d946ef',width:120})
  const vectorScene=editor.snapshot(),vectorPng=await createImageBitmap(await editor.exportPng()),vectorCanvas=element()
  vectorCanvas.width=400;vectorCanvas.height=200;vectorCanvas.getContext('2d').drawImage(vectorPng,0,0)
  if(JSON.stringify([...vectorCanvas.getContext('2d').getImageData(60,60,1,1).data])!==JSON.stringify([217,70,239,255]))throw Error('Vector recolor was not rendered')
  vectorPng.close();vectorCanvas.remove()
  await editor.undo();await editor.redo();if(JSON.stringify(editor.snapshot())!==JSON.stringify(vectorScene))throw Error('Vector undo/redo failed')
  await editor.destroy()
  editor=await createStudioEditor(element(),{document:vectorScene,resolveImage});if(JSON.stringify(editor.snapshot())!==JSON.stringify(vectorScene))throw Error('Vector reopen failed');await editor.destroy()
  result.vector={recolorPixels:true,history:true,reopen:true}
  editor=await createStudioEditor(element(),{document:blankDocument(500,240),resolveImage})
  await editor.add('text',{x:10,y:20,width:470,height:120,fontSize:48,text:'Ideas que toman forma'})
  const fonts=[]
  for(const font of STUDIO_FONTS.filter(font=>font.file)) {
    editor.select(editor.snapshot().objects[0].id)
    await editor.patch({fontFamily:font.family})
    if(editor.snapshot().objects[0].fontFamily!==font.family||!document.fonts.check(`48px "${font.family}"`))throw Error(`Font was not loaded: ${font.family}`)
    const png=await editor.exportPng(),jpg=await editor.exportImage('jpg',1)
    if(png.type!=='image/png'||jpg.type!=='image/jpeg')throw Error('Font export failed')
    fonts.push({family:font.family,pngBytes:png.size,jpgBytes:jpg.size})
  }
  await editor.destroy();result.fonts=fonts
  editor=await createStudioEditor(element(),{document:blankDocument(4096,4096),resolveImage})
  const limitStart=performance.now(),limitPng=await editor.exportImage('png'),limitJpg=await editor.exportImage('jpg',0.9)
  const limitImage=await createImageBitmap(limitJpg)
  if(limitImage.width!==4096 || limitImage.height!==4096 || limitPng.type!=='image/png')throw Error('Maximum-size export failed')
  limitImage.close();result.exportLimit={width:4096,height:4096,pngBytes:limitPng.size,jpgBytes:limitJpg.size,elapsedMs:performance.now()-limitStart}
  await editor.destroy()
  const benchmarks = []
  for (const count of [20, 200, 500]) {
    const doc = blankDocument(1080, 1080)
    for (let n = 0; n < count; n++) doc.objects.push({ id: `o${n}`, type: n % 5 === 0 ? 'text' : n % 2 ? 'ellipse' : 'rectangle',
      x: (n % 20) * 45, y: Math.floor(n / 20) * 35, width: 40, height: 24, rotation: 0, fill: '#2563eb',
      ...(n % 5 === 0 ? { text: 'Runly', fontSize: 10, fontFamily: 'sans-serif' } : {}) })
    let start = performance.now()
    editor = await createStudioEditor(element(), { document: doc, resolveImage })
    const fabricOpenMs = performance.now() - start
    start = performance.now(); const png = await editor.exportPng(); const fabricExportMs = performance.now() - start
    await editor.destroy()
    const canvas = element(), renderer = new Canvas2DRenderer(canvas)
    renderer.setTheme(LIGHT_THEME); renderer.resize(1080, 1080, 1)
    const objects = doc.objects.map(item => ({ id: item.id, type: item.type, transform: { x: item.x, y: item.y, rotation: item.rotation, scaleX: 1, scaleY: 1 },
      geometry: { width: item.width, height: item.height }, style: { fill: item.fill, strokeWidth: 0, fontSize: item.fontSize }, properties: { text: item.text } }))
    const scene = { objects, viewport: { x: 0, y: 0, zoom: 1 }, selectedIds: new Set(), images: new Map(), grid: { enabled: false }, background: '#ffffff' }
    start = performance.now(); renderer.render(scene); const canvasRenderMs = performance.now() - start
    start = performance.now(); await new Promise(resolve => canvas.toBlob(resolve)); const canvasEncodeMs = performance.now() - start
    benchmarks.push({ count, fabricOpenMs, fabricExportMs, pngBytes: png.size, canvasRenderMs, canvasEncodeMs })
    canvas.remove()
  }
  return { ...result, benchmarks }
}

window.studioFontFailure=async()=>{
  const canvas=document.createElement('canvas');document.body.append(canvas)
  const editor=await createStudioEditor(canvas,{document:appendObject(blankDocument(500,240),'text')})
  editor.select(editor.snapshot().objects[0].id)
  const before=JSON.stringify(editor.snapshot());let message=''
  try{await editor.patch({fontFamily:'Pacifico'})}catch(error){message=error.message}
  if(!message.includes('Pacifico')||JSON.stringify(editor.snapshot())!==before)throw Error('Failed font replaced text or silently substituted')
  await editor.destroy()
  const another=document.createElement('canvas');document.body.append(another);let blocked=false
  try{await createStudioEditor(another,{document:appendObject(blankDocument(),'text',{fontFamily:'Pacifico'})})}catch{blocked=true}
  if(!blocked)throw Error('Unavailable saved font opened silently with a fallback')
  return{failedPatchPreservesScene:true,failedReopenBlocksFallback:true}
}
