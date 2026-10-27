import { createStudioEditor } from '../../../apps/desktop/src/modules/runly.studio/lib/fabric-adapter.js'
import { documentPages } from '../../../apps/shared/studio/pages.js'
const base64 = async blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob) })
async function pixels(blob) {
  const image = await createImageBitmap(blob), canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
  const context = canvas.getContext('2d'); context.drawImage(image, 0, 0)
  const data = context.getImageData(0, 0, image.width, image.height).data
  const digest = await crypto.subtle.digest('SHA-256', data)
  image.close(); return { width: canvas.width, height: canvas.height, digest: [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('') }
}
window.verifyInterchangeRendering = async payload => {
  const create = async documentData => {
    const canvas = document.createElement('canvas'); document.body.append(canvas)
    const editor = await createStudioEditor(canvas, { document: documentData, resolveImage: async id => {
      if (!payload.resources[id]) throw Error('Missing fixture original')
      return `data:image/png;base64,${payload.resources[id]}`
    } })
    return { editor, canvas }
  }
  const a = await create(payload.source), b = await create(payload.imported), pages = []
  try {
    const beforeA = JSON.stringify(a.editor.snapshot()), beforeB = JSON.stringify(b.editor.snapshot())
    for (const [index, scene] of documentPages(payload.source).entries()) {
      const first = await a.editor.exportPage(scene.page.id, 'png', 1, payload.source)
      const second = await b.editor.exportPage(documentPages(payload.imported)[index].page.id, 'png', 1, payload.imported)
      const source = await pixels(first), destination = await pixels(second)
      if (JSON.stringify(source) !== JSON.stringify(destination)) throw Error(`Roundtrip changed pixels on page ${index + 1}`)
      pages.push({ ...source, source: await base64(first), destination: await base64(second) })
    }
    if (JSON.stringify(a.editor.snapshot()) !== beforeA || JSON.stringify(b.editor.snapshot()) !== beforeB) throw Error('Export edited canonical document')
    const text = payload.imported.objects.find(o => o.type === 'text')
    b.editor.select(text.id, { individual: true }); await b.editor.patch({ text: 'Edición posterior a importar' })
    const edited = JSON.stringify(b.editor.snapshot()); if (edited === beforeB) throw Error('Imported text was not editable')
    await b.editor.undo(); if (JSON.stringify(b.editor.snapshot()) !== beforeB) throw Error('Undo lost imported composition')
    await b.editor.redo(); if (JSON.stringify(b.editor.snapshot()) !== edited) throw Error('Redo lost imported edit')
    return { pages, undoRedo: true, unchanged: true }
  } finally { await a.editor.destroy(); await b.editor.destroy(); a.canvas.remove(); b.canvas.remove() }
}
