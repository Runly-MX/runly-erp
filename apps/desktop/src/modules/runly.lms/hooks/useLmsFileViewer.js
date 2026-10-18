import { useCallback, useContext, useMemo, useState } from 'react'
import { LmsAssignmentSourceContext } from './useLmsEval.js'
import { useLmsOffice } from './useLmsOffice.js'
import { isOpenable, viewerItem } from '../lib/lmsFiles.js'

// Shared state for opening runly.lms files in the platform viewer
// (AdvancedFileViewer): images, PDF, video, audio, text and ZIP preview in
// place; other types show the viewer's fallback with «Descargar». Office files
// with an `officeFileId` get «Abrir en Office» when the instance has it (never
// for share-link guests, who have no session).
//
//   const viewer = useLmsFileViewer()
//   viewer.open(inputs, index)        // inputs: lib/lmsFiles common shape
//   <AdvancedFileViewer {...viewer.props} />
export function useLmsFileViewer() {
  const office = useLmsOffice()
  const guest = Boolean(useContext(LmsAssignmentSourceContext))
  const officeEnabled = office.enabled && !guest
  const [state, setState] = useState({ items: [], index: -1 })

  // `target` is the index in `inputs` or the input itself.
  const open = useCallback((inputs, target = 0) => {
    const list = (inputs ?? []).filter(isOpenable)
    const wanted = typeof target === 'number' ? inputs?.[target] : target
    const index = Math.max(0, list.indexOf(wanted))
    if (list.length) setState({ items: list.map(viewerItem).filter(Boolean), index })
  }, [])

  const resolve = useCallback(async (file) => {
    if (file?.url) return file.url
    try { return file?.resolveUrl ? (await file.resolveUrl()) || null : null } catch { return null }
  }, [])

  const openInOffice = office.open
  const props = useMemo(() => ({
    open: state.index >= 0,
    onOpenChange: (next) => { if (!next) setState((current) => ({ ...current, index: -1 })) },
    files: state.items,
    activeIndex: Math.max(0, state.index),
    onIndexChange: (index) => setState((current) => ({ ...current, index })),
    onResolveSignedUrl: resolve,
    onOpenInOffice: officeEnabled ? (file) => openInOffice(file.officeFileId) : null,
    canOpenInOffice: (file) => officeEnabled && Boolean(file?.officeFileId),
    zIndex: 10000,
  }), [state, resolve, officeEnabled, openInOffice])

  return { open, props, officeEnabled, openInOffice }
}
