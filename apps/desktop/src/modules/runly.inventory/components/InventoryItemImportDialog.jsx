import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { intakeRequest } from '../lib/intake.js'
import { saveBlob } from '../lib/save-blob.js'
import { ImportDialogView } from './item-import/ImportDialogView.jsx'

// Spreadsheet import for inventory items without AI: the user relates each
// file column to an item field, reviews the result, then imports. Photos come
// from pictures placed over the rows (XLSX) or a column of image links.
// This is the company-user data source; the supplier portal renders ImportDialogView with its own client.
export function InventoryItemImportDialog({ open, onOpenChange, onImported }) {
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const qc = useQueryClient()
  const token = session?.access_token

  const client = useMemo(() => ({
    call: (path, body) => intakeRequest({ apiBaseUrl: getApiUrl(), token, companyId: activeCompanyId, path: `/inventory/item-import${path}`, body }),
    async downloadTemplate() {
      const res = await fetch(`${getApiUrl()}/inventory/item-import/template`, { headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': activeCompanyId } })
      if (!res.ok) throw new Error('No se pudo descargar la plantilla.')
      saveBlob(await res.blob(), 'plantilla-activos.xlsx')
    },
    afterImport: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  }), [token, activeCompanyId, qc])

  return <ImportDialogView open={open} onOpenChange={onOpenChange} onImported={onImported} client={client} />
}
