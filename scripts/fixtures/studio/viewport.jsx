import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useStudioViewport } from '../../../apps/desktop/src/modules/runly.studio/hooks/useStudioViewport.js'
import { createStudioEditor } from '../../../apps/desktop/src/modules/runly.studio/lib/fabric-adapter.js'
import { blankDocument, appendObject } from '../../../apps/shared/studio/document.js'
import { applyOps } from '../../../apps/shared/studio/operations.js'
import { documentPages } from '../../../apps/shared/studio/pages.js'
import { Rulers } from '../../../apps/desktop/src/modules/runly.studio/components/editor/canvas/Rulers.jsx'

function Fixture() {
  const editor = useRef(null), canvas = useRef(null), [page, setPage] = useState({ width: 800, height: 600 })
  const [panel, setPanel] = useState(0)
  const view = useStudioViewport(page, editor), zoom = view.zoom
  window.viewportTest = { view, editor, canvas, setPage, setPanel }
  return <><div ref={view.viewport} style={{ position: 'absolute', inset: 0, right: panel, overflow: 'auto', touchAction: 'none', overflowAnchor: 'none' }} {...view.gestures}>
    <div style={view.stageStyle}>
      <div ref={view.paper} style={view.paperStyle}>
        <canvas ref={canvas} />
        <div data-marker style={{ position: 'absolute', left: 400, top: 300, width: 1, height: 1 }} />
        <div data-guide style={{ position: 'absolute', left: 400, top: 0, width: 1 / zoom, height: page.height, pointerEvents: 'none' }} />
      </div>
    </div>
  </div><Rulers viewportRef={view.viewport} paperRef={view.paper} page={page} zoom={zoom} /></>
}
createRoot(document.getElementById('root')).render(<Fixture />)
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve))
window.setupViewportScene = async ({ width = 800, height = 600 } = {}) => {
  const test = window.viewportTest
  const previous = test.editor.current; test.editor.current = null
  await previous?.destroy()
  test.setPage({ width, height })
  let doc = appendObject(blankDocument(width, height), 'text', { id: 'text', text: 'Texto editable\nsegunda línea', x: 80, y: 100, width: 280, height: 170, fontSize: 24 })
  doc = appendObject(doc, 'rectangle', { id: 'gradient', x: 150, y: 210, width: 90, height: 80, groupId: 'group', fillPaint: { type: 'gradient', gradientType: 'linear', angle: 35, stops: [{ offset: 0, color: '#ff0000', opacity: 1 }, { offset: 1, color: '#0000ff', opacity: 1 }] } })
  doc = appendObject(doc, 'image', { id: 'photo', x: 250, y: 210, width: 90, height: 80, groupId: 'group', fileAssetId: '00000000-0000-4000-8000-000000000001' })
  const image = document.createElement('canvas'); image.width = image.height = 16
  image.getContext('2d').fillStyle = '#eab308'; image.getContext('2d').fillRect(0, 0, 16, 16)
  window.viewportChanges = 0
  test.editor.current = await createStudioEditor(test.canvas.current, { document: doc, resolveImage: async () => image.toDataURL(), onChange: () => window.viewportChanges++ })
  await nextFrame(); window.viewportTest.view.fit(); await nextFrame(); await nextFrame()
  return test.editor.current.snapshot()
}
window.textExportTest = async () => {
  let doc = appendObject(blankDocument(320, 240), 'text', { id: 'api-text', text: 'Texto\nmultilínea', height: 175, width: 210 })
  doc.additionalPages = [{ page: { ...doc.page, id: 'p2' }, objects: doc.objects.map(o => ({ ...o, id: 'api-text-2', height: 12 })) }]
  const canvas = document.createElement('canvas'), editor = await createStudioEditor(canvas, { document: doc })
  try {
    const before = JSON.stringify(editor.snapshot())
    await editor.exportPage('p2', 'png', 1, editor.snapshot())
    return { canonical: JSON.stringify(doc) === before, unchanged: before === JSON.stringify(editor.snapshot()) }
  } finally { await editor.destroy() }
}

// Raw API-shaped canonical scenes, including deliberately non-Fabric heights.
window.setupTextPages = async () => {
  const scenes = Array.from({ length: 16 }, (_, index) => {
    let scene = appendObject(blankDocument(index % 2 ? 240 : 320, index % 2 ? 320 : 240), 'text', {
      id: `text-${index}`, x: 12, y: 16, width: 200, height: [12, 175, 65, 210][index % 4],
      text: `Página ${index + 1}\nTexto multilínea\ncon altura canónica`, fontSize: 17,
      fontFamily: index % 2 ? 'Lato' : 'Roboto', fontVariant: index % 2 ? 'bold' : 'regular',
      textAlign: index % 2 ? 'justify' : 'center', lineHeight: index % 2 ? 1.6 : 1.1,
    })
    scene = appendObject(scene, 'rectangle', { id: `shape-${index}`, x: 12, y: 165, width: 80, height: 50, fill: index % 2 ? '#ff0000' : '#0000ff' })
    scene = appendObject(scene, 'rectangle', { id: `gradient-${index}`, x: 105, y: 165, width: 80, height: 50, fillPaint: { type: 'gradient', gradientType: 'linear', angle: 35, stops: [{ offset: 0, color: '#00ff00', opacity: 1 }, { offset: 1, color: '#0000ff', opacity: 1 }] } })
    scene = appendObject(scene, 'image', { id: `photo-${index}`, x: 190, y: 165, width: 30, height: 50, fileAssetId: '00000000-0000-4000-8000-000000000001' })
    return { page: { ...scene.page, id: index ? `p${index + 1}` : 'page-1' }, objects: scene.objects }
  })
  const doc = { schemaVersion: 7, unit: 'px', ...scenes[0], additionalPages: scenes.slice(1) }, before = JSON.stringify(doc)
  const canvas = document.createElement('canvas'), secondCanvas = document.createElement('canvas')
  const photo = document.createElement('canvas'); photo.width = photo.height = 16
  photo.getContext('2d').fillStyle = '#eab308'; photo.getContext('2d').fillRect(0, 0, 16, 16)
  const resolveImage = async () => photo.toDataURL()
  let authorized = true, onAuthorize = null, changes = 0
  const editor = await createStudioEditor(canvas, { document: doc, resolveImage, onChange: () => changes++, authorizePage: async () => { if (!authorized) throw Object.assign(Error('revoked'), { status: 403 }); await onAuthorize?.() } })
  const collaborator = await createStudioEditor(secondCanvas, { document: doc, resolveImage })
  window.textPages = { editor, collaborator, doc, before, canvas, secondCanvas,
    render: async id => {
      const blob = await editor.exportPage(id, 'png', 1, doc)
      return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())))
    },
    verify: async () => {
      for (const scene of documentPages(doc)) {
        await editor.selectPage(scene.page.id)
        if (JSON.stringify(editor.snapshot()) !== before) throw Error('Switch normalized canonical text bounds')
      }
      await editor.selectPage('page-1')
      const unchanged = JSON.stringify(editor.snapshot()) === before && JSON.stringify(doc) === before
      await collaborator.applyRemote(applyOps(doc, [{ type: 'patch', pageId: 'p2', id: 'text-1', set: { height: 176 } }]))
      let calls = 0
      onAuthorize = async () => { if (++calls === 2) await editor.applyRemote(collaborator.snapshot()) }
      let rejected = false
      try { await editor.exportPage('p2', 'png', 1, doc) } catch (error) { rejected = /cambió/.test(error.message) }
      onAuthorize = null; await editor.applyRemote(doc); authorized = false
      let revoked = false
      try { await editor.exportPage('p2', 'png', 1, doc) } catch (error) { revoked = error.status === 403 }
      return { unchanged, rejected, revoked, changes }
    },
    destroy: async () => { await editor.destroy(); await collaborator.destroy() },
  }
  return doc
}
