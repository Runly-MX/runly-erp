import { useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@runly/ui'
import { StudioWorkspace } from '../../../apps/desktop/src/modules/runly.studio/components/StudioWorkspace.jsx'
import { blankDocument, appendObject } from '../../../apps/shared/studio/document.js'

const initial = appendObject(blankDocument(800, 600), 'text', { id: 'text', text: 'Zoom de Studio\nTexto editable', x: 60, y: 120, width: 600, height: 175, fontSize: 36 })
const participants = [{ userId: 'collaborator', sessionId: 'second-session', name: 'Colaborador', x: 400, y: 300, selectedId: 'text', pageId: 'page-1' }]
function Fixture() {
  const editorRef = useRef(null)
  const ready = useCallback(value => { window.workspaceEditor = value ? editorRef.current : null }, [])
  return <TooltipProvider><StudioWorkspace initial={initial} editorRef={editorRef} onReady={ready} participants={participants}
    onChange={() => {}} resolveImage={async () => { throw Error('No image') }} uploadImage={async () => { throw Error('No upload') }}
    chrome={{ name: 'Verificación del viewport', onName: () => {}, saveState: 'saved', onBack: () => {}, onShare: () => {}, onCredits: () => {}, exportDisabled: true, notices: null }} />
  </TooltipProvider>
}
createRoot(document.getElementById('root')).render(<Fixture />)
