import { useEffect, useMemo, useRef, useState } from 'react'
import { runly } from '../../../lib/runly.js'
import { createStudioSync } from '../lib/studio-sync.js'
import {requireStudioProtocol} from '../../../../../shared/studio/protocol.js'

const unwrap = response => response?.data ?? response
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('')

// One sync session per opened design: local editor changes become operation
// batches (POST /studio/designs/:id/changes); collaborators' batches arrive
// through the realtime channel and are shown through editor.applyRemote.
export function useStudioSync({ record, token, scope, editorRef, onName, onError, onConflict }) {
  const [status, setStatus] = useState('synced')
  const [revision,setRevision]=useState(record.revision)
  const callbacks = useRef({ onName, onError, onConflict, token })
  useEffect(() => { callbacks.current = { onName, onError, onConflict, token } }, [onName, onError, onConflict, token])
  const sync = useMemo(() => createStudioSync({
    document: record.document, revision: record.revision, name: record.name, clientId: randomId(),actorId:scope.split(':')[1],
    transport: {
      send: async batch => {try{requireStudioProtocol(unwrap(await runly.studio.protocol(callbacks.current.token)))}catch(error){if(error.status===404)requireStudioProtocol(null);throw error}return unwrap(await runly.studio.applyChanges(record.id, batch, callbacks.current.token))},
      fetch: async batch => {
        try{requireStudioProtocol(unwrap(await runly.studio.protocol(callbacks.current.token)))}catch(error){if(error.status===404)requireStudioProtocol(null);throw error}
        let fresh=unwrap(await runly.studio.getDesign(record.id,callbacks.current.token))
        const receipt=batch?unwrap(await runly.studio.changeReceipt(record.id,batch,callbacks.current.token)):null
        if(receipt&&receipt.revision>fresh.revision)fresh=unwrap(await runly.studio.getDesign(record.id,callbacks.current.token))
        return {document:fresh.document,revision:fresh.revision,name:fresh.name,canEdit:fresh.canEdit,receipt}
      },
    },
    // Before the canvas exists the shared state is kept and shown once it is ready.
    editor: { apply: async document => editorRef.current?.applyRemote(document) },
    onStatus: setStatus,
    onRevision:setRevision,
    onName: name => callbacks.current.onName?.(name),
    onError: (message, error) => callbacks.current.onError?.(message, error),
    onConflict: draft => callbacks.current.onConflict?.(draft),
    storage: window.sessionStorage,storageKey:`runly:studio:queue:${scope}:${record.id}`,
  }), [record.id,scope]) // eslint-disable-line react-hooks/exhaustive-deps -- one session per scoped design
  useEffect(() => {sync.start();const online=()=>sync.resync();window.addEventListener('online',online);return () => {window.removeEventListener('online',online);sync.close()}}, [sync])
  return { sync, status,revision }
}
