// PDF certificate templates: the uploaded file (for the field editor), the
// field layout, detected fields and a sample-data preview of unsaved fields.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { certErrorMessage, toBlob } from '../lib/lmsCert.js'
import { layoutPayload } from '../lib/certLayout.js'
import { KEY, unwrap, useRead, useToken } from './useLmsData.js'

// The template's PDF as a Blob (react-pdf source). Refetched when the file changes.
export const useCertificateTemplateFile = (template) => useRead(
  // Own family: saving fields invalidates 'cert-templates' but must not reload the PDF.
  ['cert-template-file', template?.id, template?.fileAssetId],
  async (token) => {
    const res = unwrap(await runly.lms.getCertificateTemplateFileUrl(template.id, token))
    if (!res?.url) throw new Error('El archivo de la plantilla no está disponible.')
    const download = await fetch(res.url)
    if (!download.ok) throw new Error('No se pudo cargar el PDF de la plantilla.')
    return download.blob()
  },
  { enabled: Boolean(template?.id && template?.source === 'pdf'), staleTime: Infinity, refetchOnWindowFocus: false, retry: false },
)

export function useSaveCertificateLayout() {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fields }) => unwrap(await runly.lms.saveCertificateTemplateLayout(id, layoutPayload(fields), token)),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [KEY, 'cert-templates'] })
      toast.success('Campos guardados.')
    },
    onError: (error) => toast.error(certErrorMessage(error, 'No se pudieron guardar los campos.')),
  })
}

// { page, fields, matched, defaulted, missing }; nothing is saved.
export function useSuggestCertificateLayout() {
  const token = useToken()
  return useMutation({
    mutationFn: async (id) => unwrap(await runly.lms.suggestCertificateTemplateLayout(id, token)),
    onError: (error) => toast.error(certErrorMessage(error, 'No se pudieron detectar los campos.')),
  })
}

// Sample-data PDF of the given (possibly unsaved) fields, as a Blob.
export function useLayoutPreview() {
  const token = useToken()
  return useMutation({
    mutationFn: async ({ id, fields }) => toBlob(await runly.lms.previewCertificateTemplateLayout(id, layoutPayload(fields), token)),
    onError: (error) => toast.error(certErrorMessage(error, 'No se pudo generar la vista previa.')),
  })
}
