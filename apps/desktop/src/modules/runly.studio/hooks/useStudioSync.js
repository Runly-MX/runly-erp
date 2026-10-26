import { useEffect, useMemo, useRef, useState } from 'react'
import { runly } from '../../../lib/runly.js'
import { createStudioSync } from '../lib/studio-sync.js'

const unwrap = response => response?.data ?? response
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('')

// One sync session per opened design: local editor changes become operation
// batches (POST /studio/designs/:id/changes); collaborators' batches arrive
// through the realtime channel and are shown through editor.applyRemote.
export function useStudioSync({ record, token, editorRef, onName, onError }) {
  const [status, setStatus] = useState('synced')
  const callbacks = useRef({ onName, onError })
  useEffect(() => { callbacks.current = { onName, onError } }, [onName, onError])
  const sync = useMemo(() => createStudioSync({
    document: record.document, revision: record.revision, name: record.name, clientId: randomId(),
    transport: {
      send: async batch => unwrap(await runly.studio.applyChanges(record.id, batch, token)),
      fetch: async () => { const fresh = unwrap(await runly.studio.getDesign(record.id, token)); return { document: fresh.document, revision: fresh.revision, name: fresh.name } },
    },
    // Before the canvas exists the shared state is kept and shown once it is ready.
    editor: { apply: async document => editorRef.current?.applyRemote(document) },
    onStatus: setStatus,
    onName: name => callbacks.current.onName?.(name),
    onError: (message, error) => callbacks.current.onError?.(message, error),
  }), [record.id]) // eslint-disable-line react-hooks/exhaustive-deps -- one session per design
  useEffect(() => () => sync.close(), [sync])
  return { sync, status }
}
