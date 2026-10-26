// Synthetic standalone editor: no API, authentication, Storage or database connection.
import { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@runly/ui'
import { StudioWorkspace } from '../../../apps/desktop/src/modules/runly.studio/components/StudioWorkspace.jsx'
import { appendObject, blankDocument } from '../../../apps/shared/studio/document.js'

let initial = blankDocument(800, 600)
initial = appendObject(initial, 'text', { text: 'Ideas que toman forma', x: 60, y: 160, width: 640, fontSize: 48, fill: '#1e293b' })
initial = appendObject(initial, 'text', { text: 'Una idea.\nMuchas posibilidades.', x: 60, y: 320, width: 620, fontSize: 36, fill: '#7c3aed' })
initial = appendObject(initial, 'rectangle', { x: 60, y: 510, width: 200, height: 24, fill: '#d946ef' })

function Fixture() {
  const editorRef = useRef(null), [name, setName] = useState('Estudio tipográfico')
  const onReady = useCallback(ready => {
    // Test-only surface. Production components never expose editor internals globally.
    window.studioUX = ready ? editorRef.current : null
  }, [])
  return <TooltipProvider><StudioWorkspace initial={initial} editorRef={editorRef} onReady={onReady}
    onChange={() => {}} resolveImage={async () => { throw Error('No image fixture') }}
    uploadImage={async () => { throw Error('No image fixture') }}
    chrome={{ name, onName: setName, saveState: 'saved', onBack: () => {}, onSave: () => {}, saveDisabled: true,
      onShare: () => {}, onCredits: () => {}, exportDisabled: true, notices: null }} />
  </TooltipProvider>
}
createRoot(document.getElementById('root')).render(<Fixture />)
