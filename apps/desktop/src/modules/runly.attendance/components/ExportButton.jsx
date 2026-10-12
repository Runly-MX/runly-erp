import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { attendanceRequest, saveBlob } from '../lib/attendanceRequest.js'

// Downloads one of the server-built xlsx exports (people | punches | hours).
// `query` is appended as-is; the browser timezone offset is added so Excel shows local time.
export function ExportButton({ kind, query = {}, fileName, label = 'Exportar Excel', variant = 'outline', disabled = false, secondary = false }) {
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const params = new URLSearchParams({ offset: String(new Date().getTimezoneOffset()) })
      for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
      const blob = await attendanceRequest({ apiBaseUrl: getApiUrl(), token: session?.access_token, companyId: activeCompanyId, path: `/attendance/export/${kind}?${params}`, blob: true })
      saveBlob(blob, `${fileName ?? kind}.xlsx`)
    } catch (error) {
      toast.error(error?.message || 'No se pudo exportar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant={variant}
      onClick={run}
      disabled={disabled || busy}
      aria-label={secondary ? label : undefined}
      title={secondary ? label : undefined}
      className={secondary ? 'max-sm:w-11 max-sm:px-0' : undefined}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span className={secondary ? 'max-sm:sr-only' : undefined}>{label}</span>
    </Button>
  )
}
