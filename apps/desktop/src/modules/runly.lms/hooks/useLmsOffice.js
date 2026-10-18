import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useOfficeActions } from '@runly/ui'

// Opens a runly.lms FileAsset (submission file or certificate template) in the
// shared Office (Collabora) editor, reusing runly.files' OfficeEditorScreen
// under the LMS route. The API decides view or edit per file; closing returns
// here (search params included, so an open review sheet reopens) and refreshes
// the LMS queries. `enabled` is false when the instance has no Office.
export function useLmsOffice() {
  const office = useOfficeActions()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const open = useCallback((fileId) => {
    if (!fileId) return
    navigate(`/app/m/runly.lms/files/${encodeURIComponent(fileId)}/edit`, {
      state: { officeReturnTo: `${pathname}${search}`, officeInvalidate: ['lms'] },
    })
  }, [navigate, pathname, search])
  return { enabled: Boolean(office?.configured), open }
}
