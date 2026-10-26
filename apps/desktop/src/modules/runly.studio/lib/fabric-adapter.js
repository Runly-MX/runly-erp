import { Canvas, Rect, Ellipse, Textbox, FabricImage, ActiveSelection, Group, Path } from 'fabric'
import { appendObject, validateDocument } from '../../../../../shared/studio/document.js'
import { resizeDocument } from '../../../../../shared/studio/page.js'
import { createDocumentHistory } from './document-history.js'
import { ensureStudioFont } from './studio-fonts.js'
import { photoFileId, documentAssetIds, supportsPhotoFill, SHAPE_TYPES } from '../../../../../shared/studio/shape-properties.js'
import { createStudioPhoto, StudioPhoto } from './studio-photo.js'
import { imageProperties, DEFAULT_IMAGE } from '../../../../../shared/studio/image-properties.js'
import { studioFontStyle } from '../../../../../shared/studio/fonts.js'
import { StudioLine } from './studio-line.js'
import { importStudioSvg } from '../../../../../shared/studio/svg-geometry.js'

// Fabric owns interaction; only the canonical Runly scene enters history or storage.
export async function createStudioEditor(element, { document, resolveImage, onChange, onSelection, onError, onHistory, onPointer, onEditImage, readOnly = false, sharedClipboard, authorizePaste }) {
  let protectedMode = readOnly, exportingNow = false
  const writable = () => {
    if (protectedMode) throw new Error('Diseño de solo lectura.')
    if (exportingNow) throw new Error('Espera a que termine la exportación.')
  }
  let current = validateDocument(document), destroyed = false, history, clipboard = []
  let queue = Promise.resolve(), interaction = null, pendingAdjustments = null, selectingGroup = false, individualSelection = null
  const canvas = new Canvas(element, { width: current.page.width, height: current.page.height,
    backgroundColor: current.page.background, preserveObjectStacking: true, enableRetinaScaling: false })
  const source = new Map()
  const flags = item => ({ visible: !item.hidden, selectable: !item.locked, evented: !item.locked,
    lockMovementX: item.locked || protectedMode || exportingNow, lockMovementY: item.locked || protectedMode || exportingNow, lockScalingX: item.locked || protectedMode || exportingNow, lockScalingY: item.locked || protectedMode || exportingNow,
    lockRotation: item.locked || protectedMode || exportingNow, editable: !item.locked && !protectedMode && !exportingNow })
  async function build(item,budget={pixels:canvas.getObjects().filter(object=>object.studioId!==item.id).reduce((sum,object)=>sum+(object.studioPixels??0),0)}) {
    let pixels=0
    const reserve=image=>{
      pixels=image.width*image.height
      if(!pixels||image.width>8192||image.height>8192||pixels>25_000_000||budget.pixels+pixels>25_000_000)throw Error('El diseño supera el límite de 25 megapíxeles de imágenes decodificadas o 8192 px por lado.')
      budget.pixels+=pixels
    }
    const options = { left: item.x, top: item.y, angle: item.rotation, fill: item.fill, originX: 'left', originY: 'top' }
    let object
    if(SHAPE_TYPES.includes(item.type)&&(item.fillPaint||item.shape)){
      object=photoFileId(item)?await createStudioPhoto(item,resolveImage,reserve):new StudioPhoto(item,null)
    }
    else if (item.type === 'text') {
      await ensureStudioFont(item.fontFamily,item.fontVariant)
      const style=studioFontStyle(item.fontFamily,item.fontVariant)
      object = new Textbox(item.text, { ...options, width: item.width, fontSize: item.fontSize, fontFamily: item.fontFamily, fontWeight:style.weight, fontStyle:style.style, scaleX: item.scaleX, scaleY: item.scaleY,
        textAlign:item.textAlign,lineHeight:item.lineHeight,charSpacing:item.charSpacing,underline:item.underline,linethrough:item.linethrough })
    }
    else if (item.type === 'rectangle') object = new Rect({ ...options, width: item.width, height: item.height })
    else if (item.type === 'ellipse') object = new Ellipse({ ...options, rx: item.width / 2, ry: item.height / 2 })
    else if(item.type==='line')object=new StudioLine(item)
    else if (item.type === 'vector') {
      const { width,height,paths } = item.geometry
      const shapes = [new Rect({ left:0,top:0,width,height,fill:'transparent',strokeWidth:0 })]
      for (const path of paths) shapes.push(new Path(path.d, { fill:path.fill==='color'?item.fill:null, stroke:path.stroke==='color'?item.fill:null, strokeWidth:path.strokeWidth, strokeLineCap:path.cap, strokeLineJoin:path.join }))
      object = new Group(shapes, { ...options, subTargetCheck:false, interactive:false })
      object.set({ scaleX:item.width/object.width,scaleY:item.height/object.height })
    }
    else if(item.type==='image'&&item.image) object=await createStudioPhoto(item,resolveImage,reserve)
    else {
      try { object = await FabricImage.fromURL(await resolveImage(item.fileAssetId), { crossOrigin: 'anonymous' }) }
      catch { throw new Error('No se pudo cargar la imagen original. Comprueba el archivo y reintenta.') }
      try{reserve(object)}catch(error){object.dispose();throw error}
      object.set({ ...options, scaleX: item.width / object.width, scaleY: item.height / object.height })
    }
    object.studioId = item.id
    object.studioPixels=pixels
    object.set({ ...flags(item), opacity:item.opacity??1, lockScalingFlip: true, minScaleLimit: 0.02 })
    return object
  }
  function snapshot() {
    const stable = (value, original) => Math.abs(value - original) < 1e-8 ? original : value
    return validateDocument({ ...current, objects: canvas.getObjects().map(object => {
      const item = source.get(object.studioId)
      const position = object.getXY(), scaling = object.group ? object.getObjectScaling() : { x: object.scaleX, y: object.scaleY }
      return { ...item, x: stable(position.x, item.x), y: stable(position.y, item.y), width: stable(Math.max(1, object.width * scaling.x), item.width),
        height: stable(Math.max(1, object.height * scaling.y), item.height), rotation: stable(object.getTotalAngle() % 360, item.rotation), fill: item.fill,
        ...(item.type === 'text' ? { text: object.text, fontSize: object.fontSize } : {}),
        ...(['text','line'].includes(item.type) ? { width: object.width, height: object.height, scaleX: stable(scaling.x, item.scaleX), scaleY: stable(scaling.y, item.scaleY) } : {}) }
    }) })
  }
  const withPhoto=(item,fileAssetId)=>item.type==='image'?{...item,fileAssetId}:{...item,fillPaint:{...item.fillPaint,fileAssetId}}
  function selected() {
    const object = canvas.getActiveObject()
    return object?.studioId ? snapshot().objects.find(item => item.id === object.studioId) : null
  }
  function selection() {
    const active = canvas.getActiveObject()
    const groupId=active?.studioId&&source.get(active.studioId)?.groupId
    if(groupId&&!selectingGroup&&individualSelection!==active.studioId){editor.selectGroup(groupId);return}
    if (active?.type === 'activeselection') {
      // User groups move together. Scaling/rotation stays locked until nested
      // affine transforms have their own verified canonical representation.
      active.set({ lockMovementX: protectedMode || exportingNow, lockMovementY: protectedMode || exportingNow, lockScalingX: true, lockScalingY: true, lockRotation: true })
    }
    onSelection?.(selected(), canvas.getActiveObjects().map(object => object.studioId))
  }
  function changed(record = true) {
    try {
      const document = snapshot()
      if (record && !interaction) history.commit(document)
      onChange?.(document); selection(); onHistory?.({ ...history.state(), canPaste: clipboard.length > 0 })
    } catch (error) { onError?.(error.message) }
  }
  async function restore(document, requiresWrite = false) {
    const next = validateDocument(document), objects = [],budget={pixels:0}
    try { for (const item of next.objects) objects.push(await build(item,budget)); if(requiresWrite)writable() }
    catch (error) { objects.forEach(object => object.dispose()); throw error }
    if (destroyed) { objects.forEach(object => object.dispose()); return }
    canvas.discardActiveObject(); canvas.getObjects().forEach(object => { canvas.remove(object); object.dispose() })
    current = next; source.clear(); next.objects.forEach(item => source.set(item.id, item))
    objects.forEach(object=>object.set(flags(source.get(object.studioId))))
    canvas.add(...objects); canvas.setDimensions({ width: next.page.width, height: next.page.height })
    canvas.backgroundColor = next.page.background; canvas.requestRenderAll()
  }
  function enqueue(action) {
    const task = queue.then(() => destroyed ? undefined : action())
    queue = task.catch(() => {})
    return task
  }
  async function travelHistory(direction) {
    writable()
    const next = history.peek(direction)
    if (!next) return
    const ids = canvas.getActiveObjects().map(object => object.studioId)
    await restore(next, true)
    history.move(direction)
    // Restore by stable document IDs, never by disposed Fabric object references.
    const surviving = ids.filter(id => source.has(id) && !source.get(id).hidden)
    if (surviving.length === 1) editor.select(surviving[0])
    else editor.selectMany(surviving)
    changed(false)
  }
  function applyItem(object,item,patch) {
    object.set({left:item.x,top:item.y,angle:item.rotation,fill:item.fill,opacity:item.opacity??1,...flags(item)})
    if(item.type==='vector'&&!object.configure)object.getObjects().slice(1).forEach((shape,index)=>{const path=item.geometry.paths[index];shape.set({fill:path.fill==='color'?item.fill:null,stroke:path.stroke==='color'?item.fill:null})})
    if(item.type==='text'){
      const style=studioFontStyle(item.fontFamily,item.fontVariant)
      object.set({text:item.text,fontSize:item.fontSize,width:item.width,scaleX:item.scaleX,scaleY:item.scaleY,fontFamily:item.fontFamily,fontWeight:style.weight,fontStyle:style.style,
        textAlign:item.textAlign,lineHeight:item.lineHeight,charSpacing:item.charSpacing,underline:item.underline,linethrough:item.linethrough})
    }
    if(item.type==='line'){object.set({width:item.width,height:item.height,scaleX:item.scaleX,scaleY:item.scaleY});object.configure(item)}
    if((item.type==='image'||SHAPE_TYPES.includes(item.type))&&object.configure)object.configure({...item,width:object.width,height:object.height})
    if(!['text','line'].includes(item.type)){
      if(patch.width!==undefined)object.set({scaleX:item.width/object.width})
      if(patch.height!==undefined)object.set({scaleY:item.height/object.height})
    }
    source.set(item.id,item);object.setCoords();canvas.requestRenderAll();changed()
  }
  try { await restore(current) } catch (error) { await canvas.dispose(); throw error }
  history = createDocumentHistory(snapshot())
  onHistory?.({ ...history.state(), canPaste: sharedClipboard ? sharedClipboard.read().length > 0 : false })
  // Only committed transforms enter history; pointer moves do not create entries.
  canvas.on('object:modified', () => {
    // A frame resize recomputes cover/contain instead of baking a stretched photo.
    const doc=snapshot(),items=new Map(doc.objects.map(item=>[item.id,item]))
    for(const object of canvas.getObjects())if(object.configure&&source.get(object.studioId)?.type!=='line'&&!object.group){
      const item=items.get(object.studioId);object.set({scaleX:1,scaleY:1});object.configure(item);object.setCoords();source.set(item.id,item)
    }
    changed()
  })
  canvas.on('text:changed', () => changed())
  canvas.on('mouse:move', event => { const point = canvas.getScenePoint(event.e); onPointer?.({ x: point.x, y: point.y }) })
  canvas.on('mouse:out', () => onPointer?.(null))
  for (const event of ['selection:created', 'selection:updated', 'selection:cleared']) canvas.on(event, selection)
  const editor = {
    snapshot,
    setShapeStyle(patch){const item=selected();if(!item||!SHAPE_TYPES.includes(item.type))throw Error('Selecciona una forma.');return editor.patch({shape:{...item.shape,...patch}})},
    setPhotoFill(fileAssetId,image={}){const item=selected();if(!item||!supportsPhotoFill(item))throw Error('Esta geometr?a no admite fotograf?a.');return editor.patch({fill:item.fillPaint?.type==='solid'?item.fillPaint.color:item.fill,fillPaint:{type:'image',fileAssetId,image}})},
    removePhotoFill(){const item=selected();if(!item||!SHAPE_TYPES.includes(item.type))throw Error('Selecciona una forma.');return editor.patch({fillPaint:undefined})},
    async importSvg(svg,name){writable();const result=importStudioSvg(svg,name);await editor.add('vector',result.object);return {warnings:result.warnings,provenance:result.provenance}},
    setLineStyle(patch){if(selected()?.type!=='line')throw Error('Selecciona una línea.');return editor.patch(patch)},
    group() {
      writable()
      const ids=new Set(canvas.getActiveObjects().map(o=>o.studioId)),doc=snapshot(),items=doc.objects.filter(o=>ids.has(o.id))
      if(items.length<2||items.some(o=>o.locked||o.hidden||o.groupId))throw Error('Selecciona al menos dos elementos editables y sin agrupar.')
      let n=1;while(doc.objects.some(o=>o.groupId===`group-${n}`||o.id===`group-${n}`))n++
      const groupId=`group-${n}`
      for(const item of items)source.set(item.id,{...item,groupId})
      changed();return {id:groupId,objectIds:items.map(o=>o.id)}
    },
    ungroup() {
      writable()
      const groups=new Set(canvas.getActiveObjects().map(o=>source.get(o.studioId)?.groupId).filter(Boolean))
      for(const [id,item]of source)if(groups.has(item.groupId)){const next={...item};delete next.groupId;source.set(id,next)}
      changed()
    },
    groups(){const groups=new Map();for(const item of snapshot().objects)if(item.groupId){if(!groups.has(item.groupId))groups.set(item.groupId,[]);groups.get(item.groupId).push(item.id)}return [...groups].map(([id,objectIds])=>({id,objectIds}))},
    selectGroup(id){const group=editor.groups().find(g=>g.id===id);if(group)editor.selectMany(group.objectIds)},
    setTextStyle(patch) {
      const item=selected();if(item?.type!=='text')throw Error('Selecciona un texto.')
      const allowed=new Set(['fontFamily','fontVariant','fontSize','textAlign','lineHeight','charSpacing','underline','linethrough','fill'])
      if(Object.keys(patch).some(key=>!allowed.has(key)))throw Error('Propiedad de texto no admitida.')
      return editor.patch(patch)
    },
    beginInteraction() {
      writable();return enqueue(() => {writable();if(interaction)throw Error('Ya hay una interacción activa.');interaction={document:snapshot(),ids:canvas.getActiveObjects().map(o=>o.studioId)}})
    },
    async endInteraction(commit = true) {
      writable();await pendingAdjustments?.promise;return enqueue(async () => {writable();if(!interaction)return;const previous=interaction;interaction=null
        if(!commit){await restore(previous.document,true);editor.selectMany(previous.ids)}
        else history.commit(snapshot())
        changed(false)
      })
    },
    setImageMask(mask,properties={}) {return editor.patchImage({mask,...properties})},
    cropImage(crop) {return editor.patchImage({crop})},
    patchImage(patch) {
      writable()
      const target=editor.captureImage().object
      return enqueue(async () => {
        const captured=editor.captureImage(target.id)
        if(canvas.getActiveObject()?.studioId!==target.id||photoFileId(captured.object)!==photoFileId(target))throw Error('La imagen seleccionada cambió durante la operación.')
        const properties=imageProperties({...imageProperties(captured.object.type==='image'?captured.object.image:captured.object.fillPaint.image),...patch})
        const next=captured.object.type==='image'?{...captured.object,image:properties}:{...captured.object,fillPaint:{...captured.object.fillPaint,image:properties}}
        const active=canvas.getActiveObject()
        if(active.configure){
          writable();active.configure({...next,width:active.width,height:active.height});source.set(next.id,next);canvas.requestRenderAll();changed();return
        }
        const replacement=await build(next)
        try {
          writable()
          if(destroyed||editor.captureImage(next.id).fingerprint!==captured.fingerprint)throw Error('La imagen cambió durante el procesamiento.')
          const old=canvas.getActiveObject(),index=canvas.getObjects().indexOf(old)
          canvas.discardActiveObject();canvas.remove(old);old.dispose();source.set(next.id,next);canvas.insertAt(index,replacement);editor.select(next.id);changed()
        }catch(error){replacement.dispose();throw error}
      })
    },
    updateImageAdjustments(patch) {
      const captured=editor.captureImage()
      // One filter pass per animation frame, with the latest slider values.
      if(pendingAdjustments&&pendingAdjustments.id===captured.object.id){Object.assign(pendingAdjustments.patch,patch);return pendingAdjustments.promise}
      const pending={id:captured.object.id,fileId:photoFileId(captured.object),patch:{...patch}}
      pendingAdjustments=pending
      pending.promise=(async()=>{
        await new Promise(resolve=>requestAnimationFrame(resolve))
        if(pendingAdjustments===pending)pendingAdjustments=null
        const latest=editor.captureImage(pending.id)
        if(photoFileId(latest.object)!==pending.fileId)throw Error('La fotografía cambió durante el ajuste.')
        if(canvas.getActiveObject()?.studioId!==pending.id)throw Error('La selección cambió durante el ajuste.')
        return editor.patchImage({adjustments:{...imageProperties(latest.object.type==='image'?latest.object.image:latest.object.fillPaint.image).adjustments,...pending.patch}})
      })()
      return pending.promise
    },
    resetImageAdjustments() {return editor.patchImage({adjustments:DEFAULT_IMAGE.adjustments})},
    resetImageFraming() {const {object}=editor.captureImage();const properties=imageProperties(object.type==='image'?object.image:object.fillPaint.image);return editor.patchImage({...properties,offsetX:0,offsetY:0,zoom:1,rotation:0,crop:DEFAULT_IMAGE.crop})},
    editImage(id = canvas.getActiveObject()?.studioId) {
      writable()
      if (!onEditImage) throw Error('El editor fotográfico no está conectado.')
      return onEditImage(id)
    },
    captureImage(id = canvas.getActiveObject()?.studioId) {
      writable()
      const item = snapshot().objects.find(item => item.id === id && photoFileId(item) && !item.locked && !item.hidden)
      if (!item) throw Error('Selecciona una imagen editable.')
      return { object: item, fileAssetId:photoFileId(item), fingerprint: JSON.stringify(item) }
    },
    replaceImage(id, fileAssetId, fingerprint) {
      writable()
      return enqueue(async () => {
        writable()
        const captured = editor.captureImage(id)
        if (fingerprint && captured.fingerprint !== fingerprint) throw Error('La imagen cambió durante la edición. La copia se conserva en Files.')
        await authorizePaste?.([withPhoto(captured.object,fileAssetId)])
        const item = validateDocument({...snapshot(),objects:snapshot().objects.map(object => object.id === id ? withPhoto(object,fileAssetId) : object)}).objects.find(object => object.id === id)
        const replacement = await build(item)
        try {
          writable()
          if (destroyed || editor.captureImage(id).fingerprint !== captured.fingerprint) throw Error('La imagen cambió durante la edición. La copia se conserva en Files.')
          const original = canvas.getObjects().find(object => object.studioId === id), index = canvas.getObjects().indexOf(original)
          canvas.discardActiveObject(); canvas.remove(original); original.dispose()
          source.set(id,item); canvas.insertAt(index,replacement); editor.select(id); canvas.requestRenderAll(); changed()
        } catch (error) { replacement.dispose(); throw error }
      })
    },
    flush: async () => {await pendingAdjustments?.promise;await queue},
    setReadOnly(value) {
      protectedMode = value; canvas.getObjects().forEach(object => object.set(flags(source.get(object.studioId))))
      if (canvas.getActiveObject()?.type === 'activeselection') canvas.getActiveObject().set({ lockMovementX: value || exportingNow, lockMovementY: value || exportingNow })
      canvas.requestRenderAll()
    },
    select(id,{individual=false}={}) {
      individualSelection=individual?id:null
      const object = canvas.getObjects().find(item => item.studioId === id)
      if (object) { canvas.setActiveObject(object); canvas.requestRenderAll(); selection() }
    },
    selectMany(ids) {
      selectingGroup=true;individualSelection=null
      canvas.discardActiveObject()
      const wanted = new Set(ids)
      const objects = canvas.getObjects().filter(object => wanted.has(object.studioId) && !source.get(object.studioId)?.hidden && !source.get(object.studioId)?.locked)
      if (objects.length === 1) canvas.setActiveObject(objects[0])
      else if (objects.length > 1) canvas.setActiveObject(new ActiveSelection(objects, { canvas, lockMovementX: protectedMode || exportingNow, lockMovementY: protectedMode || exportingNow, lockScalingX: true, lockScalingY: true, lockRotation: true }))
      canvas.requestRenderAll(); selection();selectingGroup=false
    },
    // Context menu: select what is under the pointer, keeping a multi-selection
    // the pointer is inside of. Returns false on empty canvas.
    pick(event) {
      const target = canvas.findTarget(event)
      if (!target) { canvas.discardActiveObject(); canvas.requestRenderAll(); selection(); return false }
      if (target !== canvas.getActiveObject() && target.studioId) { canvas.setActiveObject(target); canvas.requestRenderAll(); selection() }
      return true
    },
    selectAll() { editor.selectMany(canvas.getObjects().map(object => object.studioId)) },
    isEditingText: () => Boolean(canvas.getActiveObject()?.isEditing),
    setPanMode(value) { canvas.skipTargetFind = value; canvas.selection = !value; canvas.defaultCursor = value ? 'grab' : 'default' },
    resize(page, scaleContent = false) {
      writable()
      return enqueue(async () => { writable(); const next = resizeDocument(snapshot(), page, scaleContent); await restore(next,true); changed() })
    },
    align(direction, target = 'page') {
      writable()
      return enqueue(async () => {
        writable()
        const ids = canvas.getActiveObjects().map(object => object.studioId)
        const wanted = new Set(ids)
        canvas.discardActiveObject()
        const objects = canvas.getObjects().filter(object => wanted.has(object.studioId) && !source.get(object.studioId)?.locked && !source.get(object.studioId)?.hidden)
        const bounds = objects.map(object => ({ object, box: object.getBoundingRect() }))
        const positions = new Map(objects.map(object => [object, { left: object.left, top: object.top }]))
        if (!bounds.length || (direction.startsWith('distribute') && bounds.length < 3)) { editor.selectMany(ids); return }
        const reference = target === 'page' ? { left: 0, top: 0, width: current.page.width, height: current.page.height } : {
          left: Math.min(...bounds.map(({box}) => box.left)), top: Math.min(...bounds.map(({box}) => box.top)),
          width: Math.max(...bounds.map(({box}) => box.left + box.width)) - Math.min(...bounds.map(({box}) => box.left)),
          height: Math.max(...bounds.map(({box}) => box.top + box.height)) - Math.min(...bounds.map(({box}) => box.top)),
        }
        if (direction.startsWith('distribute')) {
          const horizontal = direction === 'distribute-x', axis = horizontal ? 'left' : 'top', size = horizontal ? 'width' : 'height'
          bounds.sort((a,b) => a.box[axis] - b.box[axis])
          const first = bounds[0].box[axis], last = bounds.at(-1).box
          const gap = (last[axis] + last[size] - first - bounds.reduce((sum,{box}) => sum + box[size],0)) / (bounds.length - 1)
          let position = first
          for (const {object,box} of bounds) { object.set(axis, object[axis] + position - box[axis]); object.setCoords(); position += box[size] + gap }
        } else for (const {object,box} of bounds) {
          const dx = { left: reference.left - box.left, center: reference.left + reference.width / 2 - box.left - box.width / 2, right: reference.left + reference.width - box.left - box.width }[direction] ?? 0
          const dy = { top: reference.top - box.top, middle: reference.top + reference.height / 2 - box.top - box.height / 2, bottom: reference.top + reference.height - box.top - box.height }[direction] ?? 0
          object.set({ left: object.left + dx, top: object.top + dy }); object.setCoords()
        }
        // Validate before recording; rollback all object coordinates on invalid limits.
        try { validateDocument(snapshot()) } catch (error) { for (const object of objects) { object.set(positions.get(object)); object.setCoords() }; editor.selectMany(ids); throw error }
        editor.selectMany(ids); canvas.requestRenderAll(); changed()
      })
    },
    add(type, extra) {
      writable()
      return enqueue(async () => {
        writable()
        const item = appendObject(snapshot(), type, extra).objects.at(-1), object = await build(item)
        if (destroyed) { object.dispose(); return }
        try{writable()}catch(error){object.dispose();throw error}
        source.set(item.id, item); canvas.add(object); canvas.setActiveObject(object); canvas.requestRenderAll(); changed()
      })
    },
    patch(patch) {
      writable()
      patch={...patch}
      for(const end of ['start','end'])if(patch[end+'Arrow']!==undefined&&patch[end+'Cap']===undefined)patch[end+'Cap']=patch[end+'Arrow']?'arrow':'none'
      const object = canvas.getActiveObject()
      if (!object?.studioId) return
      const original = source.get(object.studioId)
      if (original.locked && Object.keys(patch).some(key => !['locked', 'hidden'].includes(key))) return
      const next = validateDocument({ ...snapshot(), objects: snapshot().objects.map(item => item.id === object.studioId ? { ...item, ...patch } : item) })
      const item = next.objects.find(item => item.id === object.studioId)
      if(SHAPE_TYPES.includes(item.type)&&(item.fillPaint||item.shape||original.fillPaint||original.shape))return enqueue(async()=>{
        const fingerprint=JSON.stringify(snapshot().objects.find(o=>o.id===original.id))
        if(JSON.stringify(snapshot().objects.find(o=>o.id===original.id))!==fingerprint)throw Error('La forma cambi\u00f3 durante la operaci\u00f3n.')
        await authorizePaste?.([item]);const replacement=await build(item)
        try{writable();if(destroyed||JSON.stringify(snapshot().objects.find(o=>o.id===original.id))!==fingerprint)throw Error('La forma cambi\u00f3 durante la operaci\u00f3n.')
          const index=canvas.getObjects().indexOf(object);canvas.discardActiveObject();canvas.remove(object);object.dispose();source.set(item.id,item);canvas.insertAt(index,replacement);editor.select(item.id);canvas.requestRenderAll();changed()
        }catch(error){replacement.dispose();throw error}
      })
      if (item.type === 'text' && (item.fontFamily !== original.fontFamily || item.fontVariant !== original.fontVariant)) return enqueue(async () => {
        await ensureStudioFont(item.fontFamily,item.fontVariant); writable()
        if (destroyed || !canvas.getObjects().includes(object)) return
        // Preserve intervening edits and selection while the font downloads.
        const latest=source.get(item.id)
        if(latest.locked)return
        const refreshed=validateDocument({...snapshot(),objects:snapshot().objects.map(current=>current.id===item.id?{...current,...patch}:current)}).objects.find(current=>current.id===item.id)
        applyItem(object,refreshed,patch)
      })
      applyItem(object,item,patch)
    },
    remove() {
      writable()
      const objects = canvas.getActiveObjects().filter(object => !source.get(object.studioId)?.locked)
      if (!objects.length) return
      canvas.discardActiveObject(); canvas.remove(...objects)
      objects.forEach(object => { source.delete(object.studioId); object.dispose() })
      canvas.requestRenderAll(); changed()
    },
    copy() {
      const ids = new Set(canvas.getActiveObjects().map(object => object.studioId))
      clipboard = snapshot().objects.filter(item => ids.has(item.id))
      sharedClipboard?.write(snapshot(), clipboard)
      onHistory?.({ ...history.state(), canPaste: clipboard.length > 0 })
    },
    paste() {
      writable()
      return enqueue(async () => {
        if (sharedClipboard) clipboard = sharedClipboard.read()
        if (!clipboard.length) return
        await authorizePaste?.(clipboard)
        writable()
        let next = snapshot()
        const groupIds=new Map(),occupiedGroupIds=new Set(next.objects.flatMap(object=>[object.groupId,object.id]).filter(Boolean))
        for (const item of clipboard) {
          const properties = Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'id'))
          if(properties.groupId){if(!groupIds.has(properties.groupId)){let n=1;while(occupiedGroupIds.has(`group-${n}`))n++;const groupId=`group-${n}`;occupiedGroupIds.add(groupId);groupIds.set(properties.groupId,groupId)}properties.groupId=groupIds.get(properties.groupId)}
          const id = `clip-${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`
          next = appendObject(next, item.type, { ...properties, id, x: item.x + 20, y: item.y + 20, locked: false, hidden: false })
        }
        await restore(next,true); editor.select(next.objects.at(-1).id); changed()
      })
    },
    duplicate() { editor.copy(); return editor.paste() },
    order(direction) {
      writable()
      const object = canvas.getActiveObject()
      if (!object?.studioId || source.get(object.studioId)?.locked) return
      const objects = canvas.getObjects(), index = objects.indexOf(object)
      const target = { front: objects.length - 1, back: 0, up: index + 1, down: index - 1 }[direction]
      canvas.moveObjectTo(object, Math.max(0, Math.min(objects.length - 1, target))); canvas.requestRenderAll(); changed()
    },
    undo() { writable(); return enqueue(() => travelHistory('undo')) },
    redo() { writable(); return enqueue(() => travelHistory('redo')) },
    async exportImage(format = 'png', quality = 0.9, reviewedScene) {
      await editor.flush()
      return enqueue(async () => {
        if (!['png','jpg'].includes(format) || !Number.isFinite(quality) || quality < 0.1 || quality > 1) throw new Error('Formato o calidad no válidos.')
        if(reviewedScene && JSON.stringify(snapshot())!==JSON.stringify(validateDocument(reviewedScene)))throw new Error('El diseño cambió. Vuelve a descargar para revisar los créditos actualizados.')
        exportingNow = true; editor.setReadOnly(protectedMode)
        try {
        for(const item of snapshot().objects.filter(item=>item.type==='text')) await ensureStudioFont(item.fontFamily,item.fontVariant)
        // Refresh every original capability before rendering; a cached bitmap is not fresh authorization.
        for (const id of documentAssetIds(snapshot())) {
          try { const original = await FabricImage.fromURL(await resolveImage(id), { crossOrigin: 'anonymous' }); original.dispose() }
          catch { throw new Error('No se pudo cargar la imagen original. Comprueba el archivo y reintenta.') }
        }
        canvas.discardActiveObject(); canvas.renderAll()
        const output = canvas.toCanvasElement(1)
        return await new Promise((resolve, reject) => output.toBlob(blob => { output.width = 0; output.height = 0; blob ? resolve(blob) : reject(new Error('No se pudo exportar el diseño.')) }, format === 'jpg' ? 'image/jpeg' : 'image/png', quality))
        } finally { exportingNow = false; editor.setReadOnly(protectedMode) }
      })
    },
    exportPng() { return editor.exportImage('png') },
    async destroy() { destroyed = true; await queue; await canvas.dispose() },
  }
  return editor
}
